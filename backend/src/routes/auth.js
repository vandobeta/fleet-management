const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      password,
      place_of_residence,
      emergency_contact_1_name,
      emergency_contact_1_phone,
      emergency_contact_2_name,
      emergency_contact_2_phone,
    } = req.body;

    // Validate required fields
    if (!name || !phone || !email || !password) {
      return res.status(400).json({ error: 'Name, phone, email, and password are required' });
    }

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE phone = $1 OR email = $2',
      [phone, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this phone or email already exists' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert user
    const result = await db.query(
      `INSERT INTO users (
        name, phone, email, password_hash, place_of_residence,
        emergency_contact_1_name, emergency_contact_1_phone,
        emergency_contact_2_name, emergency_contact_2_phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, name, phone, email, role, created_at`,
      [
        name, phone, email, password_hash, place_of_residence,
        emergency_contact_1_name, emergency_contact_1_phone,
        emergency_contact_2_name, emergency_contact_2_phone,
      ]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Create default notification preferences
    await db.query(
      'INSERT INTO notification_preferences (user_id) VALUES ($1)',
      [user.id]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { phone, email, password } = req.body;

    if (!password || (!phone && !email)) {
      return res.status(400).json({ error: 'Phone/email and password are required' });
    }

    // Find user
    const result = await db.query(
      'SELECT * FROM users WHERE phone = $1 OR email = $1',
      [phone || email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, phone, email, role, place_of_residence,
        emergency_contact_1_name, emergency_contact_1_phone,
        emergency_contact_2_name, emergency_contact_2_phone,
        created_at
      FROM users WHERE id = $1`,
      [req.user.id]
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/me', auth, async (req, res) => {
  try {
    const {
      name,
      place_of_residence,
      emergency_contact_1_name,
      emergency_contact_1_phone,
      emergency_contact_2_name,
      emergency_contact_2_phone,
    } = req.body;

    const result = await db.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        place_of_residence = COALESCE($2, place_of_residence),
        emergency_contact_1_name = COALESCE($3, emergency_contact_1_name),
        emergency_contact_1_phone = COALESCE($4, emergency_contact_1_phone),
        emergency_contact_2_name = COALESCE($5, emergency_contact_2_name),
        emergency_contact_2_phone = COALESCE($6, emergency_contact_2_phone),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING id, name, phone, email, role, place_of_residence,
        emergency_contact_1_name, emergency_contact_1_phone,
        emergency_contact_2_name, emergency_contact_2_phone`,
      [
        name,
        place_of_residence,
        emergency_contact_1_name,
        emergency_contact_1_phone,
        emergency_contact_2_name,
        emergency_contact_2_phone,
        req.user.id,
      ]
    );

    res.json({ user: result.rows[0], message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    // Verify current password
    const user = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const isValid = await bcrypt.compare(current_password, user.rows[0].password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    const new_hash = await bcrypt.hash(new_password, 10);

    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [new_hash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;