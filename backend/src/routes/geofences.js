const express = require('express');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Create geofence
router.post('/', auth, async (req, res) => {
  try {
    const { name, vehicle_id, coordinates, alert_on_breach, auto_cut_engine } = req.body;

    if (!name || !vehicle_id || !coordinates) {
      return res.status(400).json({ error: 'Name, vehicle_id, and coordinates are required' });
    }

    // Verify vehicle ownership
    const vehicle = await db.query(
      'SELECT owner_id, profile_type FROM vehicles WHERE id = $1',
      [vehicle_id]
    );

    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicle.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Convert coordinates to polygon WKT
    const polygonCoords = coordinates.map(coord => `${coord.lng} ${coord.lat}`).join(', ');
    const polygonWKT = `POLYGON((${polygonCoords}, ${polygonCoords.split(',')[0]}))`;
    
    // Calculate center point
    const centerLat = coordinates.reduce((sum, c) => sum + c.lat, 0) / coordinates.length;
    const centerLng = coordinates.reduce((sum, c) => sum + c.lng, 0) / coordinates.length;

    const result = await db.query(
      `INSERT INTO geofences (
        name, vehicle_id, boundary, center_point, alert_on_breach, auto_cut_engine, created_by
      ) VALUES ($1, $2, ST_GeomFromText($3, 4326), ST_PointFromText($4, 4326), $5, $6, $7)
      RETURNING *`,
      [name, vehicle_id, polygonWKT, `${centerLng} ${centerLat}`, alert_on_breach || true, auto_cut_engine || false, req.user.id]
    );

    res.status(201).json({
      message: 'Geofence created successfully',
      geofence: result.rows[0],
    });
  } catch (error) {
    console.error('Create geofence error:', error);
    res.status(500).json({ error: 'Failed to create geofence' });
  }
});

// Get user's geofences (optionally by vehicle)
router.get('/', auth, async (req, res) => {
  try {
    const { vehicle_id } = req.query;

    let query = `
      SELECT g.*, v.plate_number, v.profile_type
      FROM geofences g
      JOIN vehicles v ON g.vehicle_id = v.id
      WHERE v.owner_id = $1
    `;
    const params = [req.user.id];

    if (vehicle_id) {
      query += ' AND g.vehicle_id = $2';
      params.push(vehicle_id);
    }

    query += ' ORDER BY g.created_at DESC';

    const result = await db.query(query, params);

    // Convert to GeoJSON
    const geofences = result.rows.map(g => ({
      ...g,
      boundary: g.boundary ? JSON.parse(g.boundary) : null,
      center_point: g.center_point ? JSON.parse(g.center_point) : null,
    }));

    res.json({ geofences });
  } catch (error) {
    console.error('Get geofences error:', error);
    res.status(500).json({ error: 'Failed to get geofences' });
  }
});

// Get single geofence
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT g.*, v.plate_number, v.profile_type
      FROM geofences g
      JOIN vehicles v ON g.vehicle_id = v.id
      WHERE g.id = $1 AND v.owner_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }

    res.json({ geofence: result.rows[0] });
  } catch (error) {
    console.error('Get geofence error:', error);
    res.status(500).json({ error: 'Failed to get geofence' });
  }
});

// Update geofence
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, alert_on_breach, auto_cut_engine, coordinates } = req.body;

    // Check ownership
    const geofence = await db.query(
      `SELECT g.*, v.owner_id FROM geofences g
      JOIN vehicles v ON g.vehicle_id = v.id
      WHERE g.id = $1`,
      [req.params.id]
    );

    if (geofence.rows.length === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }

    if (geofence.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    let boundaryUpdate = '';
    let params = [name, alert_on_breach, auto_cut_engine, req.params.id];
    let paramIndex = 4;

    if (coordinates) {
      const polygonCoords = coordinates.map(coord => `${coord.lng} ${coord.lat}`).join(', ');
      const polygonWKT = `POLYGON((${polygonCoords}, ${polygonCoords.split(',')[0]}))`;
      
      boundaryUpdate = `, boundary = ST_GeomFromText($${++paramIndex}, 4326)`;
      params.push(polygonWKT);

      // Update center point
      const centerLat = coordinates.reduce((sum, c) => sum + c.lat, 0) / coordinates.length;
      const centerLng = coordinates.reduce((sum, c) => sum + c.lng, 0) / coordinates.length;
      params.push(`${centerLng} ${centerLat}`);
      boundaryUpdate += `, center_point = ST_PointFromText($${++paramIndex}, 4326)`;
    }

    const result = await db.query(
      `UPDATE geofences SET
        name = COALESCE($1, name),
        alert_on_breach = COALESCE($2, alert_on_breach),
        auto_cut_engine = COALESCE($3, auto_cut_engine),
        updated_at = CURRENT_TIMESTAMP
        ${boundaryUpdate}
      WHERE id = $4
      RETURNING *`,
      params
    );

    res.json({
      message: 'Geofence updated successfully',
      geofence: result.rows[0],
    });
  } catch (error) {
    console.error('Update geofence error:', error);
    res.status(500).json({ error: 'Failed to update geofence' });
  }
});

// Delete geofence
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check ownership
    const geofence = await db.query(
      `SELECT g.*, v.owner_id FROM geofences g
      JOIN vehicles v ON g.vehicle_id = v.id
      WHERE g.id = $1`,
      [req.params.id]
    );

    if (geofence.rows.length === 0) {
      return res.status(404).json({ error: 'Geofence not found' });
    }

    if (geofence.rows[0].owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.query('DELETE FROM geofences WHERE id = $1', [req.params.id]);

    res.json({ message: 'Geofence deleted successfully' });
  } catch (error) {
    console.error('Delete geofence error:', error);
    res.status(500).json({ error: 'Failed to delete geofence' });
  }
});

// Get geofence breaches
router.get('/:id/breaches', auth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const result = await db.query(
      `SELECT ga.* FROM geofence_alerts ga
      JOIN geofences g ON ga.geofence_id = g.id
      JOIN vehicles v ON g.vehicle_id = v.id
      WHERE g.id = $1 AND v.owner_id = $2
      ORDER BY ga.created_at DESC
      LIMIT $3`,
      [req.params.id, req.user.id, parseInt(limit)]
    );

    res.json({ breaches: result.rows });
  } catch (error) {
    console.error('Get breaches error:', error);
    res.status(500).json({ error: 'Failed to get breaches' });
  }
});

module.exports = router;