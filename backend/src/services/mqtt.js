const mqtt = require('mqtt');
const db = require('../config/database');

let client = null;
let io = null;

const connect = (socketIO) => {
  io = socketIO;
  
  const flespiToken = process.env.FLESPI_TOKEN || process.env.MQTT_PASSWORD;
  const broker = process.env.FLESPI_MQTT_BROKER || 'mqtt.flespi.io';
  const port = process.env.FLESPI_MQTT_PORT || 8883;

  const options = {
    clientId: `fleet_management_${Math.random().toString(36).substr(2, 9)}`,
    username: flespiToken,
    password: flespiToken,
    cleanSession: true,
    reconnectPeriod: 5000,
  };

  const url = `mqtt://${broker}:${port}`;

  console.log(`Connecting to flespi MQTT at ${url}...`);

  client = mqtt.connect(url, options);

  client.on('connect', () => {
    console.log('Connected to flespi MQTT broker');
    
    // Subscribe to device telemetry
    client.subscribe(' flespi/+/telemetry', { qos: 1 }, (err) => {
      if (err) {
        console.error('MQTT subscribe error:', err);
      } else {
        console.log('Subscribed to flespi telemetry');
      }
    });

    // Subscribe to device status
    client.subscribe('flespi/+/status', { qos: 1 }, (err) => {
      if (err) {
        console.error('MQTT subscribe error:', err);
      }
    });
  });

  client.on('message', async (topic, message) => {
    try {
      const topicParts = topic.split('/');
      
      if (topicParts[2] === 'telemetry') {
        await handleTelemetry(topicParts[1], message.toString());
      } else if (topicParts[2] === 'status') {
        await handleStatus(topicParts[1], message.toString());
      }
    } catch (error) {
      console.error('MQTT message error:', error);
    }
  });

  client.on('error', (error) => {
    console.error('MQTT error:', error);
  });

  client.on('reconnect', () => {
    console.log('MQTT reconnecting...');
  });

  client.on('close', () => {
    console.log('MQTT connection closed');
  });
};

const handleTelemetry = async (deviceId, payload) => {
  try {
    const data = JSON.parse(payload);
    
    // Find vehicle by flespi device ID
    const vehicle = await db.query(
      'SELECT id, owner_id, profile_type FROM vehicles WHERE flespi_device_id = $1',
      [deviceId]
    );

    if (vehicle.rows.length === 0) {
      return;
    }

    const vehicleId = vehicle.rows[0].id;
    const profileType = vehicle.rows[0].profile_type;

    // Extract telemetry
    const {
      timestamp,
      lat,
      lon,
      altitude,
      speed,
      heading,
      ign,
      battery,
      backup_battery,
      gsm,
      satellites,
    } = data;

    // Store in database
    await db.query(
      `INSERT INTO telemetry_logs (
        vehicle_id, flespi_device_id, timestamp,
        latitude, longitude, altitude,
        speed, heading, ignition,
        external_voltage, backup_battery_voltage,
        gsm_signal, satellites
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        vehicleId,
        deviceId,
        timestamp ? new Date(timestamp * 1000) : new Date(),
        lat,
        lon,
        altitude,
        speed,
        heading,
        ign === 1,
        battery,
        backup_battery,
        gsm,
        satellites,
      ]
    );

    // Emit real-time update
    if (io) {
      io.emit(`vehicle:${vehicleId}:telemetry`, {
        latitude: lat,
        longitude: lon,
        speed,
        heading,
        ignition: ign === 1,
        timestamp: new Date(),
      });
    }

    // Process profile-specific logic
    await processTelemetryProfileLogic(vehicleId, profileType, { lat, lon, speed, ign: ign === 1 });

  } catch (error) {
    console.error('Handle telemetry error:', error);
  }
};

const handleStatus = async (deviceId, payload) => {
  try {
    const data = JSON.parse(payload);
    
    // Find vehicle
    const vehicle = await db.query(
      'SELECT id FROM vehicles WHERE flespi_device_id = $1',
      [deviceId]
    );

    if (vehicle.rows.length === 0) return;

    const vehicleId = vehicle.rows[0].id;

    // Update device status
    await db.query(
      `UPDATE vehicles SET device_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [data.online ? 'online' : 'offline', vehicleId]
    );

    // Emit status update
    if (io) {
      io.emit(`vehicle:${vehicleId}:status`, {
        online: data.online,
        timestamp: new Date(),
      });
    }

  } catch (error) {
    console.error('Handle status error:', error);
  }
};

const processTelemetryProfileLogic = async (vehicleId, profileType, data) => {
  try {
    if (profileType === 'leasing') {
      // Check payment status
      const payment = await db.query(
        'SELECT next_payment_due, payment_status FROM payment_schedules WHERE vehicle_id = $1',
        [vehicleId]
      );

      if (payment.rows.length > 0) {
        const ps = payment.rows[0];
        const now = new Date();
        const nextDue = new Date(ps.next_payment_due);

        if (now > nextDue && ps.payment_status !== 'overdue') {
          await db.query(
            `UPDATE payment_schedules SET payment_status = 'overdue', updated_at = CURRENT_TIMESTAMP WHERE vehicle_id = $1`,
            [vehicleId]
          );
          await db.query(
            `UPDATE vehicles SET payment_status = 'overdue', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [vehicleId]
          );

          // Queue auto-cut command
          await db.query(
            `INSERT INTO command_pipeline (vehicle_id, command_type, command_payload, status) VALUES ($1, 'RELAY,1', $2, 'queued')`,
            [vehicleId, JSON.stringify({ reason: 'payment_overdue', auto: true })]
          );
        }
      }
    } else if (profileType === 'renting') {
      // Check geofence breach
      if (data.lat && data.lon) {
        const geofences = await db.query(
          `SELECT * FROM geofences WHERE vehicle_id = $1 AND alert_on_breach = TRUE`,
          [vehicleId]
        );

        for (const geofence of geofences.rows) {
          const isInside = await checkPointInGeofence(geofence.id, data.lat, data.lon);
          
          if (!isInside) {
            // Log breach
            await db.query(
              `INSERT INTO geofence_alerts (vehicle_id, geofence_id, alert_type, latitude, longitude) VALUES ($1, $2, 'exit', $3, $4)`,
              [vehicleId, geofence.id, data.lat, data.lon]
            );

            // Auto-cut if enabled
            if (geofence.auto_cut_engine) {
              await db.query(
                `INSERT INTO command_pipeline (vehicle_id, command_type, command_payload, status) VALUES ($1, 'RELAY,1', $2, 'queued')`,
                [vehicleId, JSON.stringify({ reason: 'geofence_breach', auto: true })]
              );
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Profile logic error:', error);
  }
};

const checkPointInGeofence = async (geofenceId, lat, lon) => {
  const result = await db.query(
    `SELECT ST_Contains(boundary, ST_PointFromText($1, 4326)) as is_inside
    FROM geofences WHERE id = $2`,
    [`POINT(${lon} ${lat})`, geofenceId]
  );

  return result.rows[0]?.is_inside || false;
};

const disconnect = () => {
  if (client) {
    client.end();
    client = null;
  }
};

const publish = (topic, message) => {
  if (client && client.connected) {
    client.publish(topic, message);
  }
};

module.exports = {
  connect,
  disconnect,
  publish,
};