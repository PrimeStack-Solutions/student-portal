const express = require('express');
const db = require('../database/setup');
const { authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', authorize('accountant'), (req, res) => {
  const students = db.prepare(`
    SELECT s.id, u.full_name, u.email, s.tuition_balance, s.tuition_receipt_file, s.tuition_receipt_status
    FROM students s
    JOIN users u ON s.user_id = u.id
    ORDER BY u.full_name
  `).all();
  const payments = db.prepare('SELECT * FROM payments ORDER BY id DESC LIMIT 10').all();
  res.render('accountant/dashboard', { user: req.session.user, students, payments });
});

router.post('/toggle-payment', authorize('accountant'), (req, res) => {
  const { student_id } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
  const newBalance = student.tuition_balance > 0 ? 0 : 250;
  db.prepare('UPDATE students SET tuition_balance = ?, portal_access = ?, tuition_receipt_status = ? WHERE id = ?')
    .run(newBalance, newBalance === 0 ? 'granted' : 'blocked', newBalance === 0 ? 'approved' : 'pending', student_id);
  res.redirect('/accountant/dashboard');
});

module.exports = router;