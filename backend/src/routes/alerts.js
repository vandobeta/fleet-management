const express = require('express');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get alerts for user's vehicles
router.get('/', auth, async (req, res) => {
  try {
    const { vehicle_id, alert_type, limit = 50, acknowledged } = req.query;

    let query = `
      SELECT a.*, v.plate_number
      FROM anti_theft_alerts a
      JOIN vehicles v ON a.vehicle_id = v.id
      WHERE v.owner_id = $1
    `;
    const params = [req.user.id];

    if (vehicle_id) {
      query += ` AND a.vehicle_id = $${params.length + 1}`;
      params.push(vehicle_id);
    }

    if (alert_type) {
      query += ` AND a.alert_type = $${params.length + 1}`;
      params.push(alert_type);
    }

    if (acknowledged !== undefined) {
      query += ` AND a.acknowledged = $${params.length + 1}`;
      params.push(acknowledged === 'true');
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({ alerts: result.rows });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// Get single alert
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, v.plate_number
      FROM anti_theft_alerts a
      JOIN vehicles v ON a.vehicle_id = v.id
      WHERE a.id = $1 AND v.owner_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ alert: result.rows[0] });
  } catch (error) {
    console.error('Get alert error:', error);
    res.status(500).json({ error: 'Failed to get alert' });
  }
});

// Acknowledge alert
router.post('/:id/acknowledge', auth, async (req, res) => {
  try {
    // Check ownership
    const alert = await db.query(
      `SELECT a.*, v.owner_id FROM anti_theft_alerts a
      JOIN vehicles v ON a.vehicle_id = v.id
      WHERE a.id = $1`,
      [req.params.id]
    );

    if (alert.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    if (alert.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await db.query(
      `UPDATE anti_theft_alerts SET
        acknowledged = TRUE,
        acknowledged_by = $1,
        acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *`,
      [req.user.id, req.params.id]
    );

    res.json({ message: 'Alert acknowledged', alert: result.rows[0] });
  } catch (error) {
    console.error('Acknowledge alert error:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Test alert system
router.post('/test', auth, async (req, res) => {
  try {
    const { vehicle_id } = req.body;

    if (!vehicle_id) {
      return res.status(400).json({ error: 'Vehicle ID is required' });
    }

    // Verify ownership
    const vehicle = await db.query(
      'SELECT owner_id FROM vehicles WHERE id = $1',
      [vehicle_id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicle.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get latest telemetry for location
    const telemetry = await db.query(
      `SELECT latitude, longitude, speed FROM telemetry_logs
      WHERE vehicle_id = $1
      ORDER BY timestamp DESC
      LIMIT 1`,
      [vehicle_id]
    );

    // Create test alert
    const result = await db.query(
      `INSERT INTO anti_theft_alerts (
        vehicle_id, alert_type, severity, description, latitude, longitude, speed
      ) VALUES ($1, 'shock', 'low', 'Test alert - system check', $2, $3, $4)
      RETURNING *`,
      [
        vehicle_id,
        telemetry.rows[0]?.latitude || null,
        telemetry.rows[0]?.longitude || null,
        telemetry.rows[0]?.speed || null,
      ]
    );

    // Get user emergency contacts
    const user = await db.query(
      `SELECT emergency_contact_1_phone, emergency_contact_2_phone FROM users WHERE id = $1`,
      [req.user.id]
    );

    // Log notification (in production, would send SMS here)
    if (user.rows[0].emergency_contact_1_phone) {
      await db.query(
        `INSERT INTO notification_logs (user_id, vehicle_id, notification_type, title, message, sent_via)
        VALUES ($1, $2, 'anti_theft', 'Test Alert', 'This is a test alert from the fleet management system', 'sms')`,
        [req.user.id, vehicle_id]
      );
    }

    res.status(201).json({
      message: 'Test alert sent successfully',
      alert: result.rows[0],
    });
  } catch (error) {
    console.error('Test alert error:', error);
    res.status(500).json({ error: 'Failed to send test alert' });
  }
});

module.exports = router;