const express = require('express');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get driver scores for user's vehicles
router.get('/driver-scores', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ds.*, v.plate_number, v.profile_type
      FROM driver_scores ds
      JOIN vehicles v ON ds.vehicle_id = v.id
      WHERE v.owner_id = $1
      ORDER BY ds.score DESC`,
      [req.user.id]
    );

    res.json({ driver_scores: result.rows });
  } catch (error) {
    console.error('Get driver scores error:', error);
    res.status(500).json({ error: 'Failed to get driver scores' });
  }
});

// Get driver score for specific vehicle
router.get('/driver-scores/:vehicleId', auth, async (req, res) => {
  try {
    // Verify ownership
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
      `SELECT * FROM driver_scores WHERE vehicle_id = $1`,
      [req.params.vehicleId]
    );

    res.json({ driver_score: result.rows[0] || null });
  } catch (error) {
    console.error('Get driver score error:', error);
    res.status(500).json({ error: 'Failed to get driver score' });
  }
});

// Get acceleration events for vehicle
router.get('/acceleration-events/:vehicleId', auth, async (req, res) => {
  try {
    const { limit = 100, start_date, end_date } = req.query;

    // Verify ownership
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
      SELECT * FROM acceleration_events
      WHERE vehicle_id = $1
    `;
    const params = [req.params.vehicleId];

    if (start_date) {
      query += ` AND timestamp >= $${params.length + 1}`;
      params.push(new Date(start_date));
    }

    if (end_date) {
      query += ` AND timestamp <= $${params.length + 1}`;
      params.push(new Date(end_date));
    }

    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({ events: result.rows });
  } catch (error) {
    console.error('Get acceleration events error:', error);
    res.status(500).json({ error: 'Failed to get acceleration events' });
  }
});

// Get brake pad wear data
router.get('/brake-wear', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT bw.*, v.plate_number, v.profile_type
      FROM brake_pad_wear bw
      JOIN vehicles v ON bw.vehicle_id = v.id
      WHERE v.owner_id = $1
      ORDER BY bw.estimated_remaining_percentage ASC`,
      [req.user.id]
    );

    res.json({ brake_wear: result.rows });
  } catch (error) {
    console.error('Get brake wear error:', error);
    res.status(500).json({ error: 'Failed to get brake wear data' });
  }
});

// Get brake pad wear for specific vehicle
router.get('/brake-wear/:vehicleId', auth, async (req, res) => {
  try {
    // Verify ownership
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

    const result = await db.query(
      `SELECT * FROM brake_pad_wear WHERE vehicle_id = $1`,
      [req.params.vehicleId]
    );

    res.json({ brake_wear: result.rows[0] || null });
  } catch (error) {
    console.error('Get brake wear error:', error);
    res.status(500).json({ error: 'Failed to get brake wear data' });
  }
});

// Get fleet overview
router.get('/fleet-overview', auth, async (req, res) => {
  try {
    // Get total vehicles
    const totalVehicles = await db.query(
      `SELECT COUNT(*) as count FROM vehicles WHERE owner_id = $1`,
      [req.user.id]
    );

    // Get vehicles by profile type
    const byProfile = await db.query(
      `SELECT profile_type, COUNT(*) as count 
      FROM vehicles WHERE owner_id = $1
      GROUP BY profile_type`,
      [req.user.id]
    );

    // Get active vehicles (with recent telemetry)
    const activeVehicles = await db.query(
      `SELECT COUNT(DISTINCT v.id) as count
      FROM vehicles v
      JOIN telemetry_logs t ON v.id = t.vehicle_id
      WHERE v.owner_id = $1 AND t.timestamp > NOW() - INTERVAL '1 hour'`,
      [req.user.id]
    );

    // Get overdue payments count
    const overduePayments = await db.query(
      `SELECT COUNT(*) as count
      FROM vehicles v
      JOIN payment_schedules ps ON v.id = ps.vehicle_id
      WHERE v.owner_id = $1 AND ps.payment_status = 'overdue'`,
      [req.user.id]
    );

    // Get geofence breaches today
    const todayBreaches = await db.query(
      `SELECT COUNT(*) as count
      FROM vehicles v
      JOIN geofence_alerts ga ON v.id = ga.vehicle_id
      WHERE v.owner_id = $1 AND ga.created_at::date = CURRENT_DATE`,
      [req.user.id]
    );

    // Get average driver score
    const avgDriverScore = await db.query(
      `SELECT AVG(ds.score) as avg_score
      FROM driver_scores ds
      JOIN vehicles v ON ds.vehicle_id = v.id
      WHERE v.owner_id = $1`,
      [req.user.id]
    );

    res.json({
      overview: {
        total_vehicles: parseInt(totalVehicles.rows[0].count),
        active_vehicles: parseInt(activeVehicles.rows[0].count),
        overdue_payments: parseInt(overduePayments.rows[0].count),
        today_breaches: parseInt(todayBreaches.rows[0].count),
        average_driver_score: Math.round(parseFloat(avgDriverScore.rows[0].avg_score) || 0),
        by_profile: byProfile.rows.reduce((acc, row) => {
          acc[row.profile_type] = parseInt(row.count);
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error('Get fleet overview error:', error);
    res.status(500).json({ error: 'Failed to get fleet overview' });
  }
});

module.exports = router;