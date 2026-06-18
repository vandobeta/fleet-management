const db = require('../config/database');

// Handle flespi webhook - receives telemetry data
const handleFlespiWebhook = async (req, res) => {
  try {
    const { device_id, timestamp, position, sensors, ignition, speed, heading, gsm, battery } = req.body;

    // Find vehicle by flespi device ID
    const vehicle = await db.query(
      'SELECT id, owner_id, profile_type FROM vehicles WHERE flespi_device_id = $1',
      [device_id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found for device' });
    }

    const vehicleId = vehicle.rows[0].id;
    const profileType = vehicle.rows[0].profile_type;

    // Extract telemetry data
    const latitude = position?.latitude || req.body.latitude;
    const longitude = position?.longitude || req.body.longitude;
    const altitude = position?.altitude || req.body.altitude;
    const telemetrySpeed = speed?.value || req.body.speed;
    const telemetryHeading = heading?.value || req.body.heading;
    const ignitionStatus = ignition?.value !== undefined ? ignition.value : req.body.ignition;
    const externalVoltage = battery?.external?.value || req.body.external_voltage;
    const backupBattery = battery?.backup?.value || req.body.backup_battery;
    const gsmSignal = gsm?.value || req.body.gsm_signal;
    const gpsValid = position?.valid !== undefined ? position.valid : req.body.gps_valid;

    // Store telemetry
    const telemetryResult = await db.query(
      `INSERT INTO telemetry_logs (
        vehicle_id, flespi_device_id, timestamp,
        latitude, longitude, altitude,
        speed, heading, ignition,
        external_voltage, backup_battery_voltage,
        gsm_signal, gps_signal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        vehicleId,
        device_id,
        timestamp ? new Date(timestamp) : new Date(),
        latitude,
        longitude,
        altitude,
        telemetrySpeed,
        telemetryHeading,
        ignitionStatus,
        externalVoltage,
        backupBattery,
        gsmSignal,
        gpsValid,
      ]
    );

    const telemetryId = telemetryResult.rows[0].id;

    // Process profile-specific logic
    await processProfileLogic(vehicleId, profileType, {
      latitude,
      longitude,
      speed: telemetrySpeed,
      ignition: ignitionStatus,
    });

    // Emit real-time update via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit(`vehicle:${vehicleId}:telemetry`, {
        latitude,
        longitude,
        speed: telemetrySpeed,
        heading: telemetryHeading,
        ignition: ignitionStatus,
        timestamp: new Date(),
      });
    }

    res.json({ success: true, telemetry_id: telemetryId });
  } catch (error) {
    console.error('Flespi webhook error:', error);
    res.status(500).json({ error: 'Failed to process telemetry' });
  }
};

// Process profile-specific logic
const processProfileLogic = async (vehicleId, profileType, data) => {
  try {
    if (profileType === 'leasing') {
      // Check payment status and auto-disable if overdue
      await checkPaymentStatus(vehicleId);
    } else if (profileType === 'renting') {
      // Check geofence breach
      await checkGeofenceBreach(vehicleId, data);
    } else if (profileType === 'recovery') {
      // Enhanced monitoring - check for any alerts
      await checkRecoveryAlerts(vehicleId, data);
    }

    // Calculate driver score
    await calculateDriverScore(vehicleId, data);

    // Calculate brake pad wear
    await calculateBrakePadWear(vehicleId, data);
  } catch (error) {
    console.error('Profile logic error:', error);
  }
};

// Check payment status for leasing vehicles
const checkPaymentStatus = async (vehicleId) => {
  try {
    const payment = await db.query(
      'SELECT * FROM payment_schedules WHERE vehicle_id = $1',
      [vehicleId]
    );

    if (payment.rows.length === 0) return;

    const ps = payment.rows[0];
    const now = new Date();
    const nextDue = new Date(ps.next_payment_due);

    if (now > nextDue && ps.payment_status !== 'overdue') {
      // Mark as overdue
      await db.query(
        `UPDATE payment_schedules SET payment_status = 'overdue', updated_at = CURRENT_TIMESTAMP
        WHERE vehicle_id = $1`,
        [vehicleId]
      );

      await db.query(
        `UPDATE vehicles SET payment_status = 'overdue', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [vehicleId]
      );

      // Auto-disable engine for overdue leasing
      await sendAutoCutCommand(vehicleId, 'payment_overdue');
    }
  } catch (error) {
    console.error('Payment check error:', error);
  }
};

// Check geofence breach for renting vehicles
const checkGeofenceBreach = async (vehicleId, data) => {
  try {
    if (!data.latitude || !data.longitude) return;

    // Get active geofences for vehicle
    const geofences = await db.query(
      `SELECT g.*, ST_Contains(g.boundary, ST_PointFromText($1, 4326)) as is_inside
      FROM geofences g
      WHERE g.vehicle_id = $2 AND g.alert_on_breach = TRUE`,
      [`POINT(${data.longitude} ${data.latitude})`, vehicleId]
    );

    for (const geofence of geofences.rows) {
      const isInside = geofence.is_inside;

      // Check if there's an open alert
      const openAlert = await db.query(
        `SELECT id FROM geofence_alerts
        WHERE geofence_id = $1 AND exited_at IS NULL`,
        [geofence.id]
      );

      if (!isInside && openAlert.rows.length === 0) {
        // Vehicle exited geofence - create alert
        await db.query(
          `INSERT INTO geofence_alerts (
            vehicle_id, geofence_id, alert_type, latitude, longitude
          ) VALUES ($1, $2, 'exit', $3, $4)`,
          [vehicleId, geofence.id, data.latitude, data.longitude]
        );

        // Auto-cut engine if configured
        if (geofence.auto_cut_engine) {
          await sendAutoCutCommand(vehicleId, 'geofence_breach');
        }
      } else if (isInside && openAlert.rows.length > 0) {
        // Vehicle re-entered - close alert
        await db.query(
          `UPDATE geofence_alerts SET exited_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
          [openAlert.rows[0].id]
        );
      }
    }
  } catch (error) {
    console.error('Geofence check error:', error);
  }
};

// Check recovery mode alerts
const checkRecoveryAlerts = async (vehicleId, data) => {
  try {
    // Check for shock/impact
    if (data.g_force && Math.abs(data.g_force) > 3) {
      await createAntiTheftAlert(vehicleId, 'shock', data);
    }

    // Check for unauthorized movement when ignition off
    if (!data.ignition && data.speed > 0) {
      await createAntiTheftAlert(vehicleId, 'movement', data);
    }
  } catch (error) {
    console.error('Recovery check error:', error);
  }
};

// Create anti-theft alert
const createAntiTheftAlert = async (vehicleId, alertType, data) => {
  await db.query(
    `INSERT INTO anti_theft_alerts (
      vehicle_id, alert_type, latitude, longitude, speed
    ) VALUES ($1, $2, $3, $4, $5)`,
    [vehicleId, alertType, data.latitude, data.longitude, data.speed]
  );
};

// Send auto-cut command
const sendAutoCutCommand = async (vehicleId, reason) => {
  await db.query(
    `INSERT INTO command_pipeline (
      vehicle_id, command_type, command_payload, status
    ) VALUES ($1, 'RELAY,1', $2, 'queued')`,
    [vehicleId, JSON.stringify({ reason, auto: true })]
  );
};

// Calculate driver score based on acceleration events
const calculateDriverScore = async (vehicleId, data) => {
  // Simplified driver scoring - in production would use more sophisticated algorithm
  try {
    // Get latest acceleration events
    const events = await db.query(
      `SELECT event_type, g_force FROM acceleration_events
      WHERE vehicle_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'
      ORDER BY timestamp DESC`,
      [vehicleId]
    );

    if (events.rows.length === 0) return;

    // Calculate score based on harsh events
    let score = 100;
    for (const event of events.rows) {
      if (event.event_type === 'harsh_acceleration') score -= 5;
      if (event.event_type === 'harsh_braking') score -= 7;
      if (event.event_type === 'harsh_turning') score -= 3;
    }

    score = Math.max(0, score);

    await db.query(
      `UPDATE driver_scores SET
        score = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE vehicle_id = $2`,
      [score, vehicleId]
    );
  } catch (error) {
    console.error('Driver score error:', error);
  }
};

// Calculate brake pad wear
const calculateBrakePadWear = async (vehicleId, data) => {
  try {
    // Simplified wear calculation
    const brakeWear = await db.query(
      'SELECT * FROM brake_pad_wear WHERE vehicle_id = $1',
      [vehicleId]
    );

    if (brakeWear.rows.length === 0) return;

    const bw = brakeWear.rows[0];
    
    // Estimate wear based on deceleration events
    // This is simplified - production would use more sophisticated algorithm
    const wearRate = 0.001; // Simplified rate
    const newRemaining = Math.max(0, bw.estimated_remaining_percentage - wearRate);

    await db.query(
      `UPDATE brake_pad_wear SET
        estimated_remaining_percentage = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE vehicle_id = $2`,
      [Math.round(newRemaining), vehicleId]
    );
  } catch (error) {
    console.error('Brake wear error:', error);
  }
};

module.exports = {
  handleFlespiWebhook,
  processProfileLogic,
};