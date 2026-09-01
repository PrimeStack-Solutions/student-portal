const express = require('express');
const db = require('../database/setup');
const { authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', authorize('accountant', 'admin'), (req, res) => {
  const students = db.prepare(`
    SELECT s.id, u.full_name, u.email, s.tuition_balance, s.tuition_receipt_file, s.tuition_receipt_status,
      s.balance_payment_receipt_file, s.balance_payment_status, s.balance_payment_amount, s.balance_payment_reference
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
  const totalReceipts = receipts.length;
  const pendingApprovals = students.filter(student => student.tuition_receipt_status === 'pending' || student.balance_payment_status === 'pending').length;
  const totalOutstanding = students.reduce((sum, student) => sum + Number(student.tuition_balance || 0), 0);

  res.render('accountant/dashboard', {
    user: req.session.user,
    students,
    receipts,
    payments,
    stats: {
      totalReceipts,
      pendingApprovals,
      totalOutstanding
    }
  });
});

router.get('/announcements', authorize('accountant'), (req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC').all();
  res.render('accountant/announcements', { user: req.session.user, announcements });
});

router.post('/publish-announcement', authorize('accountant'), (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  if (!title || !body) {
    return res.redirect('/accountant/announcements');
  }

  db.prepare('INSERT INTO announcements (title, body, source) VALUES (?, ?, ?)').run(title, body, 'Accounts');
  res.redirect('/accountant/announcements');
});

router.post('/delete-announcement', authorize('accountant'), (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.body.announcement_id);
  res.redirect('/accountant/announcements');
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

router.post('/approve-balance-payment', authorize('accountant', 'admin'), (req, res) => {
  const { student_id } = req.body;
  const student = db.prepare('SELECT u.full_name, u.id AS user_id, s.tuition_balance, s.balance_payment_amount FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(student_id);
  const balance = Number(student.tuition_balance || 0);
  const paymentAmount = Number(student.balance_payment_amount || 0);
  const updatedBalance = Math.max(0, balance - paymentAmount);

  db.prepare('UPDATE students SET tuition_balance = ?, balance_payment_status = ?, balance_payment_amount = 0, balance_payment_reference = ? WHERE id = ?')
    .run(updatedBalance, 'approved', 'Approved by finance office', student_id);
  db.prepare('INSERT INTO payments (student_id, amount, payment_date, status, purpose) VALUES (?, ?, ?, ?, ?)')
    .run(student_id, paymentAmount, new Date().toISOString(), 'approved', 'Balance payment approval');
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(student.user_id, 'Balance Payment Approved', `Hello ${student.full_name}, your balance payment has been approved.`, 'email');
  res.redirect('/accountant/dashboard');
});

router.post('/reject-balance-payment', authorize('accountant', 'admin'), (req, res) => {
  const { student_id, rejection_reason } = req.body;
  const student = db.prepare('SELECT u.full_name, u.id AS user_id FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(student_id);
  db.prepare('UPDATE students SET balance_payment_status = ?, balance_payment_amount = 0, balance_payment_reference = ? WHERE id = ?')
    .run('rejected', rejection_reason || 'Receipt not verified.', student_id);
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(student.user_id, 'Balance Payment Rejected', `Hello ${student.full_name}, your payment receipt was rejected. Reason: ${rejection_reason || 'Receipt not verified.'}`, 'email');
  res.redirect('/accountant/dashboard');
});

module.exports = router;