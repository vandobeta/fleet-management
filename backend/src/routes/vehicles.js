const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Register a new vehicle (by profile type)
router.post('/register', auth, async (req, res) => {
  try {
    const {
      plate_number,
      VIN,
      profile_type,
      flespi_device_id,
      IMEI,
      tracker_phone_number,
      // Leasing/Renting specific
      payment_type,
      amount,
      // Normal tracking specific
      subscription_plan_type,
      subscription_amount,
    } = req.body;

    // Validate required fields
    if (!plate_number || !profile_type) {
      return res.status(400).json({ error: 'Plate number and profile type are required' });
    }

    // Validate profile type
    const validProfiles = ['leasing', 'renting', 'normal', 'recovery'];
    if (!validProfiles.includes(profile_type)) {
      return res.status(400).json({ error: 'Invalid profile type' });
    }

    // Validate VIN for non-normal profiles
    if (profile_type !== 'normal' && !VIN) {
      return res.status(400).json({ error: `VIN is required for ${profile_type} profile` });
    }

    // Check if plate number already exists
    const existing = await db.query(
      'SELECT id FROM vehicles WHERE plate_number = $1',
      [plate_number]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Vehicle with this plate number already exists' });
    }

    // Insert vehicle
    const vehicleResult = await db.query(
      `INSERT INTO vehicles (
        plate_number, VIN, profile_type, owner_id,
        flespi_device_id, IMEI, tracker_phone_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        plate_number,
        VIN || null,
        profile_type,
        req.user.id,
        flespi_device_id || null,
        IMEI || null,
        tracker_phone_number || null,
      ]
    );

    const vehicle = vehicleResult.rows[0];

    // Create profile-specific data
    if (profile_type === 'leasing' || profile_type === 'renting') {
      // Create payment schedule
      if (!payment_type || !amount) {
        return res.status(400).json({ error: 'Payment type and amount are required for leasing/renting' });
      }

      const account_reference = `${profile_type.toUpperCase()}-${plate_number}-${Date.now().toString(36).toUpperCase()}`;
      
      // Calculate next payment date
      const next_payment_due = new Date();
      if (payment_type === 'daily') {
        next_payment_due.setDate(next_payment_due.getDate() + 1);
      } else if (payment_type === 'weekly') {
        next_payment_due.setDate(next_payment_due.getDate() + 7);
      } else {
        next_payment_due.setMonth(next_payment_due.getMonth() + 1);
      }

      await db.query(
        `INSERT INTO payment_schedules (
          vehicle_id, payment_type, amount, account_reference, next_payment_due
        ) VALUES ($1, $2, $3, $4, $5)`,
        [vehicle.id, payment_type, amount, account_reference, next_payment_due]
      );
    } else if (profile_type === 'normal') {
      // Create subscription
      const plan_type = subscription_plan_type || 'monthly';
      const subAmount = subscription_amount || 50;
      const starts_at = new Date();
      const expires_at = new Date();
      
      if (plan_type === 'yearly') {
        expires_at.setFullYear(expires_at.getFullYear() + 1);
      } else {
        expires_at.setMonth(expires_at.getMonth() + 1);
      }

      await db.query(
        `INSERT INTO subscriptions (
          vehicle_id, plan_type, amount, starts_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5)`,
        [vehicle.id, plan_type, subAmount, starts_at, expires_at]
      );
    }

    // Create driver score record
    await db.query(
      'INSERT INTO driver_scores (vehicle_id) VALUES ($1)',
      [vehicle.id]
    );

    // Create brake pad wear record
    await db.query(
      'INSERT INTO brake_pad_wear (vehicle_id) VALUES ($1)',
      [vehicle.id]
    );

    res.status(201).json({
      message: 'Vehicle registered successfully',
      vehicle: {
        id: vehicle.id,
        plate_number: vehicle.plate_number,
        profile_type: vehicle.profile_type,
        VIN: vehicle.VIN,
        flespi_device_id: vehicle.flespi_device_id,
        tracker_phone_number: vehicle.tracker_phone_number,
      },
    });
  } catch (error) {
    console.error('Vehicle registration error:', error);
    res.status(500).json({ error: 'Failed to register vehicle' });
  }
});

// Get user's vehicles
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, 
        ps.payment_type, ps.amount, ps.account_reference, ps.next_payment_due, ps.payment_status as ps_status,
        s.plan_type, s.amount as sub_amount, s.expires_at as sub_expires_at
      FROM vehicles v
      LEFT JOIN payment_schedules ps ON v.id = ps.vehicle_id
      LEFT JOIN subscriptions s ON v.id = s.vehicle_id
      WHERE v.owner_id = $1
      ORDER BY v.created_at DESC`,
      [req.user.id]
    );

    res.json({ vehicles: result.rows });
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ error: 'Failed to get vehicles' });
  }
});

// Get single vehicle
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, 
        ps.payment_type, ps.amount, ps.account_reference, ps.next_payment_due, ps.payment_status as ps_status,
        s.plan_type, s.amount as sub_amount, s.expires_at as sub_expires_at
      FROM vehicles v
      LEFT JOIN payment_schedules ps ON v.id = ps.vehicle_id
      LEFT JOIN subscriptions s ON v.id = s.vehicle_id
      WHERE v.id = $1 AND (v.owner_id = $2 OR $3 = 'admin' = ANY(ARRAY[req.user.role]))`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    res.json({ vehicle: result.rows[0] });
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({ error: 'Failed to get vehicle' });
  }
});

// Update vehicle
router.put('/:id', auth, async (req, res) => {
  try {
    const { flespi_device_id, IMEI, tracker_phone_number } = req.body;

    // Check ownership
    const vehicle = await db.query(
      'SELECT owner_id FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicle.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await db.query(
      `UPDATE vehicles SET
        flespi_device_id = COALESCE($1, flespi_device_id),
        IMEI = COALESCE($2, IMEI),
        tracker_phone_number = COALESCE($3, tracker_phone_number),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *`,
      [flespi_device_id, IMEI, tracker_phone_number, req.params.id]
    );

    res.json({ vehicle: result.rows[0], message: 'Vehicle updated successfully' });
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

// Delete vehicle
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check ownership
    const vehicle = await db.query(
      'SELECT owner_id FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicle.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.query('DELETE FROM vehicles WHERE id = $1', [req.params.id]);

    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

// Activate lost mode
router.post('/:id/lost-mode', auth, async (req, res) => {
  try {
    const vehicle = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicle.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.query(
      'UPDATE vehicles SET lost_mode = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Lost mode activated' });
  } catch (error) {
    console.error('Lost mode error:', error);
    res.status(500).json({ error: 'Failed to activate lost mode' });
  }
});

// Deactivate lost mode
router.delete('/:id/lost-mode', auth, async (req, res) => {
  try {
    const vehicle = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicle.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.query(
      'UPDATE vehicles SET lost_mode = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Lost mode deactivated' });
  } catch (error) {
    console.error('Lost mode error:', error);
    res.status(500).json({ error: 'Failed to deactivate lost mode' });
  }
});

module.exports = router;