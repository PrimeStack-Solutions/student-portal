const express = require('express');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const router = express.Router();
const db = new Database(path.join(__dirname, '..', 'database', 'portal.db'));

// Show the login page (redirect if already logged in)
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

// Handle login form submission
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Look up the user in the database
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  // Check if user exists and password matches the stored hash
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: 'Invalid username or password' });
  }

  // Store user info in the session
  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    email: user.email,
    tuition_paid: user.tuition_paid
  };

  res.redirect('/dashboard');
});
// Destroy session and redirect to login
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Redirect to the correct dashboard based on role
router.get('/dashboard', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  const role = req.session.user.role;
  if (role === 'student') return res.redirect('/student/dashboard');
  if (role === 'accountant') return res.redirect('/accountant/dashboard');
  if (role === 'admin') return res.redirect('/admin/dashboard');

  res.redirect('/login');
});

// Show the password reset form
router.get('/reset-password', (req, res) => {
  res.render('reset-password', { error: null, success: null });
});

// Handle password reset submission
router.post('/reset-password', (req, res) => {
  const { username, email, new_password, confirm_password } = req.body;

  if (new_password !== confirm_password) {
    return res.render('reset-password', { error: 'Passwords do not match', success: null });
  }

  if (new_password.length < 6) {
    return res.render('reset-password', { error: 'Password must be at least 6 characters', success: null });
  }

  // Verify username and email match a real account
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND email = ?').get(username, email);

  if (!user) {
    return res.render('reset-password', { error: 'No account found with that username and email', success: null });
  }

  // Hash the new password and update the database
  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

  res.render('reset-password', { error: null, success: 'Password reset successfully! You can now login.' });
});

module.exports = router;
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