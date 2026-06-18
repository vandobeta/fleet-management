const express = require('express');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Send command to vehicle tracker
router.post('/send', auth, async (req, res) => {
  try {
    const { vehicle_id, command_type, priority = 0 } = req.body;

    if (!vehicle_id || !command_type) {
      return res.status(400).json({ error: 'Vehicle ID and command type are required' });
    }

    // Validate command type
    const validCommands = ['RELAY,1', 'RELAY,0', 'WHERE', 'PARAM', 'APN,internet'];
    if (!validCommands.includes(command_type)) {
      return res.status(400).json({ error: 'Invalid command type' });
    }

    // Verify vehicle ownership and get device info
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

    // Check if vehicle has tracker
    if (!v.tracker_phone_number && !v.flespi_device_id) {
      return res.status(400).json({ error: 'Vehicle has no tracker configured' });
    }

    // Check speed for safety cutoff (for RELAY commands)
    if (command_type.startsWith('RELAY')) {
      const latestTelemetry = await db.query(
        `SELECT speed FROM telemetry_logs
        WHERE vehicle_id = $1
        ORDER BY timestamp DESC
        LIMIT 1`,
        [vehicle_id]
      );

      if (latestTelemetry.rows.length > 0) {
        const maxSafeSpeed = parseInt(process.env.MAX_SAFE_CUTOFF_SPEED) || 20;
        if (latestTelemetry.rows[0].speed > maxSafeSpeed) {
          return res.status(400).json({
            error: `Vehicle speed (${latestTelemetry.rows[0].speed} km/h) exceeds safe cutoff limit (${maxSafeSpeed} km/h)`
          });
        }
      }
    }

    // Create command in pipeline
    const result = await db.query(
      `INSERT INTO command_pipeline (
        vehicle_id, command_type, command_payload, priority, status, created_by
      ) VALUES ($1, $2, $3, $4, 'queued', $5)
      RETURNING *`,
      [vehicle_id, command_type, JSON.stringify({ tracker_phone: v.tracker_phone_number }), priority, req.user.id]
    );

    // Emit event for command processor
    const io = req.app.get('io');
    io.emit('command:created', { command: result.rows[0] });

    res.status(201).json({
      message: 'Command queued successfully',
      command: result.rows[0],
    });
  } catch (error) {
    console.error('Send command error:', error);
    res.status(500).json({ error: 'Failed to send command' });
  }
});

// Get command history
router.get('/history', auth, async (req, res) => {
  try {
    const { vehicle_id, status, limit = 50 } = req.query;

    let query = `
      SELECT cp.*, v.plate_number, u.name as created_by_name
      FROM command_pipeline cp
      JOIN vehicles v ON cp.vehicle_id = v.id
      LEFT JOIN users u ON cp.created_by = u.id
      WHERE v.owner_id = $1
    `;
    const params = [req.user.id];

    if (vehicle_id) {
      query += ` AND cp.vehicle_id = $${params.length + 1}`;
      params.push(vehicle_id);
    }

    if (status) {
      query += ` AND cp.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY cp.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({ commands: result.rows });
  } catch (error) {
    console.error('Get command history error:', error);
    res.status(500).json({ error: 'Failed to get command history' });
  }
});

// Get single command status
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cp.*, v.plate_number
      FROM command_pipeline cp
      JOIN vehicles v ON cp.vehicle_id = v.id
      WHERE cp.id = $1 AND v.owner_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    res.json({ command: result.rows[0] });
  } catch (error) {
    console.error('Get command error:', error);
    res.status(500).json({ error: 'Failed to get command' });
  }
});

// Cancel pending command
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check ownership and status
    const command = await db.query(
      `SELECT cp.*, v.owner_id FROM command_pipeline cp
      JOIN vehicles v ON cp.vehicle_id = v.id
      WHERE cp.id = $1`,
      [req.params.id]
    );

    if (command.rows.length === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    const cmd = command.rows[0];

    if (cmd.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!['queued', 'pending'].includes(cmd.status)) {
      return res.status(400).json({ error: 'Cannot cancel command in current status' });
    }

    await db.query(
      `UPDATE command_pipeline SET status = 'failed', failure_reason = 'Cancelled by user', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: 'Command cancelled successfully' });
  } catch (error) {
    console.error('Cancel command error:', error);
    res.status(500).json({ error: 'Failed to cancel command' });
  }
});

module.exports = router;