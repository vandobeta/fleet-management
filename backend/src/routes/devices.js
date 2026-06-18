const express = require('express');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get tracker configuration
router.get('/:id/config', auth, async (req, res) => {
  try {
    const vehicle = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const v = vehicle.rows[0];

    if (v.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Return tracker configuration
    res.json({
      config: {
        tracker_phone_number: v.tracker_phone_number,
        flespi_device_id: v.flespi_device_id,
        IMEI: v.IMEI,
        commands: {
          location: 'WHERE#',
          status: 'PARAM#',
          cut_fuel: 'RELAY,1#',
          restore_fuel: 'RELAY,0#',
          set_apn: 'APN,internet#',
        },
      },
    });
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// Send SMS command to tracker
router.post('/:id/sms-command', auth, async (req, res) => {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    const vehicle = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const v = vehicle.rows[0];

    if (v.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!v.tracker_phone_number) {
      return res.status(400).json({ error: 'Vehicle has no tracker phone number configured' });
    }

    // In production, would send SMS via Twilio
    // For now, just log the command
    console.log(`SMS Command to ${v.tracker_phone_number}: ${command}`);

    // Create command pipeline entry
    await db.query(
      `INSERT INTO command_pipeline (
        vehicle_id, command_type, command_payload, status, created_by
      ) VALUES ($1, $2, $3, 'sent', $4)`,
      [v.id, command, JSON.stringify({ sent_via: 'sms', to: v.tracker_phone_number }), req.user.id]
    );

    res.json({
      message: 'SMS command sent',
      command,
      tracker_phone: v.tracker_phone_number,
    });
  } catch (error) {
    console.error('SMS command error:', error);
    res.status(500).json({ error: 'Failed to send SMS command' });
  }
});

// Request location via SMS (WHERE#)
router.post('/:id/sms-location', auth, async (req, res) => {
  try {
    const vehicle = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const v = vehicle.rows[0];

    if (v.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!v.tracker_phone_number) {
      return res.status(400).json({ error: 'Vehicle has no tracker phone number configured' });
    }

    console.log(`SMS Location request to ${v.tracker_phone_number}: WHERE#`);

    res.json({
      message: 'Location request sent',
      command: 'WHERE#',
      tracker_phone: v.tracker_phone_number,
    });
  } catch (error) {
    console.error('SMS location error:', error);
    res.status(500).json({ error: 'Failed to request location' });
  }
});

// Get status via SMS (PARAM#)
router.post('/:id/sms-status', auth, async (req, res) => {
  try {
    const vehicle = await db.query(
      'SELECT * FROM vehicles WHERE id = $1',
      [req.params.id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const v = vehicle.rows[0];

    if (v.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!v.tracker_phone_number) {
      return res.status(400).json({ error: 'Vehicle has no tracker phone number configured' });
    }

    console.log(`SMS Status request to ${v.tracker_phone_number}: PARAM#`);

    res.json({
      message: 'Status request sent',
      command: 'PARAM#',
      tracker_phone: v.tracker_phone_number,
    });
  } catch (error) {
    console.error('SMS status error:', error);
    res.status(500).json({ error: 'Failed to request status' });
  }
});

// Parse SMS response (for webhooks or manual input)
router.post('/parse-sms-response', auth, async (req, res) => {
  try {
    const { response_text, vehicle_id } = req.body;

    if (!response_text) {
      return res.status(400).json({ error: 'Response text is required' });
    }

    // Parse Google Maps link for location
    const mapsLinkMatch = response_text.match(/http:\/\/ditu\.google\.cn\/\?q=([^&\s]+)/);
    
    // Parse PARAM response
    const paramMatch = response_text.match(/C:(\d+).*O:(\d+).*5Y:([\d.]+).*1H:(\d+).*RELAY:(\d+)/);

    const parsed = {
      original: response_text,
    };

    if (mapsLinkMatch) {
      const coords = mapsLinkMatch[1].split(',');
      if (coords.length === 2) {
        const latMatch = coords[0].match(/N([\d.]+)/);
        const lngMatch = coords[1].match(/E([\d.]+)/);
        if (latMatch && lngMatch) {
          parsed.location = {
            latitude: parseFloat(latMatch[1]),
            longitude: parseFloat(lngMatch[1]),
          };
        }
      }
    }

    if (paramMatch) {
      parsed.status = {
        battery_voltage: parseInt(paramMatch[1]) / 10,
        backup_battery: parseInt(paramMatch[2]) / 10,
        speed: parseFloat(paramMatch[3]),
        ignition: paramMatch[4] === '1',
        relay_status: parseInt(paramMatch[5]) === 1 ? 'cut' : 'normal',
      };
    }

    // If vehicle_id provided, store telemetry
    if (vehicle_id && parsed.location) {
      await db.query(
        `INSERT INTO telemetry_logs (
          vehicle_id, latitude, longitude, timestamp
        ) VALUES ($1, $2, $3, NOW())`,
        [vehicle_id, parsed.location.latitude, parsed.location.longitude]
      );
    }

    res.json({ parsed });
  } catch (error) {
    console.error('Parse SMS response error:', error);
    res.status(500).json({ error: 'Failed to parse response' });
  }
});

module.exports = router;