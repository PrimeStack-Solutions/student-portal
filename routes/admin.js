const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { authorize } = require('../middleware/auth');

const router = express.Router();
const db = new Database(path.join(__dirname, '..', 'database', 'portal.db'));

router.get('/dashboard', authorize('admin'), (req, res) => {
  // Fetch all students for the admin to manage
  const students = db.prepare("SELECT * FROM users WHERE role = 'student'").all();
  res.render('admin/dashboard', { user: req.session.user, students: students });
});

router.post('/update-student', authorize('admin'), (req, res) => {
  // Update a student's name and email from the admin form
  const { student_id, full_name, email } = req.body;
  db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?').run(full_name, email, student_id);
  res.redirect('/admin/dashboard');
});

module.exports = router;