const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/setup');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: 'Invalid username or password' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    email: user.email
  };

  res.redirect('/dashboard');
});

router.get('/register', (req, res) => {
  res.render('register', { error: null, success: null });
});

router.post('/register', (req, res) => {
  const { username, password, confirm_password, full_name, email } = req.body;

  if (!username || !password || !full_name || !email) {
    return res.render('register', { error: 'All fields are required', success: null });
  }

  if (password !== confirm_password) {
    return res.render('register', { error: 'Passwords do not match', success: null });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.render('register', { error: 'That username is already taken', success: null });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash, role, full_name, email) VALUES (?, ?, ?, ?, ?)')
    .run(username, passwordHash, 'applicant', full_name, email);

  db.prepare('INSERT INTO applicants (user_id, program_choice, intake, status, application_fee_paid, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(result.lastInsertRowid, 'Undecided', 'Fall 2026', 'submitted', 0, 'New applicant account created');

  req.session.user = {
    id: result.lastInsertRowid,
    username,
    role: 'applicant',
    full_name,
    email
  };

  res.redirect('/applicant/dashboard');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

router.get('/dashboard', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  const role = req.session.user.role;
  if (role === 'student') return res.redirect('/student/dashboard');
  if (role === 'accountant') return res.redirect('/accountant/dashboard');
  if (role === 'admin') return res.redirect('/admin/dashboard');
  if (role === 'applicant') return res.redirect('/applicant/dashboard');

  res.redirect('/login');
});

router.get('/reset-password', (req, res) => {
  res.render('reset-password', { error: null, success: null });
});

router.post('/reset-password', (req, res) => {
  const { username, email, new_password, confirm_password } = req.body;

  if (new_password !== confirm_password) {
    return res.render('reset-password', { error: 'Passwords do not match', success: null });
  }

  if (new_password.length < 6) {
    return res.render('reset-password', { error: 'Password must be at least 6 characters', success: null });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND email = ?').get(username, email);

  if (!user) {
    return res.render('reset-password', { error: 'No account found with that username and email', success: null });
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

  res.render('reset-password', { error: null, success: 'Password reset successfully! You can now login.' });
});

module.exports = router;