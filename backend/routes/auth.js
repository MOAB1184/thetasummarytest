const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// MySQL connection pool
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root', // Change if needed
  password: 'Tashasha2024!',
  database: 'thetasummary'
});

// Register endpoint
router.post('/register', async (req, res) => {
  const { email, password, name, role, school } = req.body;
  if (!email || !password || !name || !role || !school) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0) return res.status(409).json({ error: 'Email already exists' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (email, password, name, role, school, approved) VALUES (?, ?, ?, ?, ?, ?)',
      [email, hash, name, role, school, role === 'teacher' ? 0 : 1]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.role === 'teacher' && !user.approved) return res.status(403).json({ error: 'Teacher not approved yet' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, 'your_jwt_secret', { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        school: user.school
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin approve teacher endpoint
router.post('/admin/approve-teacher', async (req, res) => {
  const { email } = req.body;
  // You should check admin auth here!
  try {
    await pool.query('UPDATE users SET approved = 1 WHERE email = ? AND role = "teacher"', [email]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 