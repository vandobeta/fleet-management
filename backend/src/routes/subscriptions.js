const express = require('express');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get user's subscriptions
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, v.plate_number, v.profile_type
      FROM subscriptions s
      JOIN vehicles v ON s.vehicle_id = v.id
      WHERE v.owner_id = $1
      ORDER BY s.expires_at ASC`,
      [req.user.id]
    );

    res.json({ subscriptions: result.rows });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Failed to get subscriptions' });
  }
});

// Get subscription for specific vehicle
router.get('/vehicle/:vehicleId', auth, async (req, res) => {
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
      'SELECT * FROM subscriptions WHERE vehicle_id = $1',
      [req.params.vehicleId]
    );

    res.json({ subscription: result.rows[0] || null });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// Renew/upgrade subscription
router.post('/renew', auth, async (req, res) => {
  try {
    const { vehicle_id, plan_type, amount } = req.body;

    if (!vehicle_id || !plan_type || !amount) {
      return res.status(400).json({ error: 'Vehicle ID, plan type, and amount are required' });
    }

    // Verify ownership
    const vehicle = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [vehicle_id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const v = vehicle.rows[0];

    if (v.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (v.profile_type !== 'normal') {
      return res.status(400).json({ error: 'Subscription is only available for normal tracking profile' });
    }

    // Calculate new expiry
    const starts_at = new Date();
    const expires_at = new Date();
    
    if (plan_type === 'yearly') {
      expires_at.setFullYear(expires_at.getFullYear() + 1);
    } else {
      expires_at.setMonth(expires_at.getMonth() + 1);
    }

    // Upsert subscription
    const result = await db.query(
      `INSERT INTO subscriptions (vehicle_id, plan_type, amount, starts_at, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (vehicle_id) DO UPDATE SET
        plan_type = EXCLUDED.plan_type,
        amount = EXCLUDED.amount,
        starts_at = EXCLUDED.starts_at,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [vehicle_id, plan_type, amount, starts_at, expires_at]
    );

    res.json({
      message: 'Subscription renewed successfully',
      subscription: result.rows[0],
    });
  } catch (error) {
    console.error('Renew subscription error:', error);
    res.status(500).json({ error: 'Failed to renew subscription' });
  }
});

module.exports = router;