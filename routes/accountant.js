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
  const receipts = db.prepare(`
    SELECT 'student' AS type, u.full_name AS full_name, u.email AS email, s.tuition_receipt_file AS file_name, s.tuition_receipt_status AS status
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.tuition_receipt_file != ''
    UNION ALL
    SELECT 'applicant' AS type, u.full_name AS full_name, u.email AS email, a.application_receipt_file AS file_name, a.application_receipt_status AS status
    FROM applicants a
    JOIN users u ON a.user_id = u.id
    WHERE a.application_receipt_file != ''
    ORDER BY full_name
  `).all();
  const payments = db.prepare('SELECT * FROM payments ORDER BY id DESC LIMIT 10').all();
  res.render('accountant/dashboard', { user: req.session.user, students, receipts, payments });
});

router.post('/approve-payment', authorize('accountant'), (req, res) => {
  const { student_id } = req.body;
  const student = db.prepare('SELECT u.full_name, u.id AS user_id FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(student_id);
  db.prepare('UPDATE students SET tuition_balance = ?, portal_access = ?, tuition_receipt_status = ? WHERE id = ?')
    .run(0, 'granted', 'approved', student_id);
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(student.user_id, 'Tuition Receipt Approved', `Hello ${student.full_name}, your tuition receipt has been approved. You can now access your student portal.`, 'email');
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(student.user_id, 'Tuition Receipt Approved SMS', 'Your tuition receipt has been approved. You can now access your student portal.', 'sms');
  res.redirect('/accountant/dashboard');
});

router.post('/revoke-payment', authorize('accountant'), (req, res) => {
  const { student_id, rejection_reason } = req.body;
  const student = db.prepare('SELECT u.full_name, u.id AS user_id FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(student_id);
  db.prepare('UPDATE students SET tuition_balance = ?, portal_access = ?, tuition_receipt_status = ?, tuition_rejection_reason = ? WHERE id = ?')
    .run(250, 'blocked', 'rejected', rejection_reason || 'Receipt was unclear or incomplete.', student_id);
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(student.user_id, 'Tuition Receipt Rejected', `Hello ${student.full_name}, your tuition receipt was rejected. Reason: ${rejection_reason || 'Receipt was unclear or incomplete.'}`, 'email');
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(student.user_id, 'Tuition Receipt Rejected SMS', `Your tuition receipt was rejected. Reason: ${rejection_reason || 'Receipt was unclear or incomplete.'}`, 'sms');
  res.redirect('/accountant/dashboard');
});

module.exports = router;