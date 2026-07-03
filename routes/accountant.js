const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { authorize } = require('../middleware/auth');

const router = express.Router();
const db = new Database(path.join(__dirname, '..', 'database', 'portal.db'));

router.get('/dashboard', authorize('accountant'), (req, res) => {
  // Fetch all students with their tuition payment status
  const students = db.prepare("SELECT id, username, full_name, email, tuition_paid FROM users WHERE role = 'student'").all();
  res.render('accountant/dashboard', { user: req.session.user, students: students });
});

module.exports = router;