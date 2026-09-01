const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/setup');

const router = express.Router();

const hasNonEmptyValue = (value) => typeof value === 'string' && value.trim().length > 0;
const hasNonEmptyPassword = (value) => hasNonEmptyValue(value);

router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const identifier = (req.body.student_number || req.body.username || '').trim();
  const password = req.body.password;

  if (!hasNonEmptyValue(identifier) || !hasNonEmptyPassword(password)) {
    return res.render('login', { error: 'Username and password are required' });
  }

  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(identifier);

  if (!user) {
    const student = db.prepare("SELECT u.* FROM students s JOIN users u ON u.id = s.user_id WHERE s.student_number IS NOT NULL AND TRIM(COALESCE(s.student_number, '')) != '' AND s.student_number = ?").get(identifier);
    if (student) {
      user = student;
    }
  }

  const student = db.prepare("SELECT student_number FROM students WHERE user_id = ?").get(user ? user.id : null);
  const matchesDefaultStudentPassword = user && user.role === 'student' && student && student.student_number && password === student.student_number.trim();

  if (!user || (!bcrypt.compareSync(password, user.password_hash) && !matchesDefaultStudentPassword)) {
    return res.render('login', { error: 'Invalid student number or password' });
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
  return res.redirect('/login');
});

router.post('/register', (req, res) => {
  return res.redirect('/login');
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
  if (role === 'student') {
    const student = db.prepare('SELECT portal_access FROM students WHERE user_id = ?').get(req.session.user.id);
    if (student && student.portal_access === 'blocked') {
      return res.redirect('/student/blocked');
    }
    return res.redirect('/student/dashboard');
  }
  if (role === 'accountant') return res.redirect('/accountant/dashboard');
  if (role === 'admin') return res.redirect('/admin/dashboard');
  if (role === 'lecturer') return res.redirect('/lecturer/dashboard');
  if (role === 'examination') return res.redirect('/examination/dashboard');
  if (role === 'applicant') return res.redirect('/applicant/dashboard');

  res.redirect('/login');
});

router.get('/reset-password', (req, res) => {
  res.render('reset-password', { error: null, success: null });
});

router.post('/reset-password', (req, res) => {
  const { student_number, email, new_password, confirm_password } = req.body;
  const normalizedStudentNumber = (student_number || '').trim();

  if (new_password !== confirm_password) {
    return res.render('reset-password', { error: 'Passwords do not match', success: null });
  }

  if (!hasNonEmptyPassword(new_password)) {
    return res.render('reset-password', { error: 'Password cannot be empty', success: null });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND email = ?').get(normalizedStudentNumber, email);

  if (!user) {
    return res.render('reset-password', { error: 'No account found with that student number and email', success: null });
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

  res.render('reset-password', { error: null, success: 'Password reset successfully! You can now login.' });
});

module.exports = router;