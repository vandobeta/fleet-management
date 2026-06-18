const express = require('express');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get payment schedules for user's vehicles
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ps.*, v.plate_number, v.profile_type, v.payment_status as vehicle_payment_status
      FROM payment_schedules ps
      JOIN vehicles v ON ps.vehicle_id = v.id
      WHERE v.owner_id = $1
      ORDER BY ps.next_payment_due ASC`,
      [req.user.id]
    );

    res.json({ payments: result.rows });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

// Get payment schedule for specific vehicle
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
      'SELECT * FROM payment_schedules WHERE vehicle_id = $1',
      [req.params.vehicleId]
    );

    res.json({ payment: result.rows[0] || null });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ error: 'Failed to get payment' });
  }
});

// Make a payment
router.post('/pay', auth, async (req, res) => {
  try {
    const { vehicle_id, amount } = req.body;

    if (!vehicle_id || !amount) {
      return res.status(400).json({ error: 'Vehicle ID and amount are required' });
    }

    // Verify ownership
    const vehicle = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [vehicle_id]
    );

    if (vehicle.rows.length ===  lease) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const v = vehicle.rows[0];

    if (v.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get payment schedule
    const payment = await db.query(
      'SELECT * FROM payment_schedules WHERE vehicle_id = $1',
      [vehicle_id]
    );

    if (payment.rows.length === 0) {
      return res.status(400).json({ error: 'No payment schedule found for this vehicle' });
    }

    const ps = payment.rows[0];

    // Verify amount matches or exceeds required amount
    if (parseFloat(amount) < parseFloat(ps.amount)) {
      return res.status(400).json({
        error: `Payment amount must be at least ${ps.amount}`,
      });
    }

    // Calculate next payment date
    let next_payment_due = new Date();
    if (ps.payment_type === 'daily') {
      next_payment_due.setDate(next_payment_due.getDate() + 1);
    } else if (ps.payment_type === 'weekly') {
      next_payment_due.setDate(next_payment_due.getDate() + 7);
    } else {
      next_payment_due.setMonth(next_payment_due.getMonth() + 1);
    }

    // Update payment schedule
    const result = await db.query(
      `UPDATE payment_schedules SET
        payment_status = 'active',
        last_payment_date = CURRENT_DATE,
        next_payment_due = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE vehicle_id = $2
      RETURNING *`,
      [next_payment_due, vehicle_id]
    );

    // Update vehicle payment status
    await db.query(
      `UPDATE vehicles SET
        payment_status = 'active',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
      [vehicle_id]
    );

    // Log notification
    await db.query(
      `INSERT INTO notification_logs (user_id, vehicle_id, notification_type, title, message, sent_via, delivered)
      VALUES ($1, $2, 'payment', 'Payment Received', 'Your payment has been processed successfully', 'in_app', TRUE)`,
      [req.user.id, vehicle_id]
    );

    res.json({
      message: 'Payment processed successfully',
      payment: result.rows[0],
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// Get account reference for payment
router.get('/account-reference/:vehicleId', auth, async (req, res) => {
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
      'SELECT account_reference, payment_type, amount, next_payment_due, payment_status FROM payment_schedules WHERE vehicle_id = $1',
      [req.params.vehicleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No payment schedule found' });
    }

    res.json({ account_reference: result.rows[0] });
  } catch (error) {
    console.error('Get account reference error:', error);
    res.status(500).json({ error: 'Failed to get account reference' });
  }
});

module.exports = router;