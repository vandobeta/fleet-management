const express = require('express');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get latest telemetry for user's vehicles
router.get('/latest', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (v.id)
        v.id as vehicle_id, v.plate_number, v.profile_type,
        t.timestamp, t.latitude, t.longitude, t.altitude, t.speed, t.heading,
        t.ignition, t.external_voltage, t.backup_battery_voltage,
        t.gsm_signal, t.gps_signal
      FROM vehicles v
      LEFT JOIN LATERAL (
        SELECT * FROM telemetry_logs
        WHERE vehicle_id = v.id
        ORDER BY timestamp DESC
        LIMIT 1
      ) t ON true
      WHERE v.owner_id = $1
      ORDER BY v.id, t.timestamp DESC`,
      [req.user.id]
    );

    res.json({ telemetry: result.rows });
  } catch (error) {
    console.error('Get latest telemetry error:', error);
    res.status(500).json({ error: 'Failed to get telemetry' });
  }
});

// Get telemetry history for a vehicle
router.get('/history/:vehicleId', auth, async (req, res) => {
  try {
    const { start_time, end_time, limit = 100 } = req.query;

    // Verify vehicle ownership
    const vehicle = await db.query(
      'SELECT owner_id FROM vehicles WHERE id = $1',
      [req.params.vehicleId]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicle.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    let query = `
      SELECT timestamp, latitude, longitude, altitude, speed, heading,
        ignition, external_voltage, backup_battery_voltage, gsm_signal, gps_signal
      FROM telemetry_logs
      WHERE vehicle_id = $1
    `;
    const params = [req.params.vehicleId];

    if (start_time) {
      query += ' AND timestamp >= $2';
      params.push(new Date(start_time));
    }

    if (end_time) {
      query += ` AND timestamp <= $${params.length + 1}`;
      params.push(new Date(end_time));
    }

    query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({ telemetry: result.rows });
  } catch (error) {
    console.error('Get telemetry history error:', error);
    res.status(500).json({ error: 'Failed to get telemetry history' });
  }
});

// Get vehicle location (latest)
router.get('/location/:vehicleId', auth, async (req, res) => {
  try {
    // Verify vehicle ownership
    const vehicle = await db.query(
      'SELECT owner_id, plate_number FROM vehicles WHERE id = $1',
      [req.params.vehicleId]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicle.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await db.query(
      `SELECT latitude, longitude, timestamp, speed, heading, ignition
      FROM telemetry_logs
      WHERE vehicle_id = $1
      ORDER BY timestamp DESC
      LIMIT 1`,
      [req.params.vehicleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No telemetry data found' });
    }

    res.json({ location: result.rows[0] });
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({ error: 'Failed to get location' });
  }
});

module.exports = router;