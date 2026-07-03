const express = require('express');
const db = require('../database/setup');
const { authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', authorize('admin'), (req, res) => {
  const students = db.prepare(`
    SELECT s.id, u.username, u.full_name, u.email, s.student_code, s.program, s.tuition_balance, s.status
    FROM students s
    JOIN users u ON s.user_id = u.id
    ORDER BY u.full_name
  `).all();
  const applicants = db.prepare(`
    SELECT a.id, a.status, a.program_choice, a.intake, u.full_name, u.email
    FROM applicants a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.id DESC
  `).all();
  const courses = db.prepare('SELECT * FROM courses ORDER BY code').all();
  const pendingEnrollments = db.prepare(`
    SELECT e.id, e.status, u.full_name AS student_name, c.code, c.name
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    JOIN users u ON s.user_id = u.id
    JOIN courses c ON e.course_id = c.id
    WHERE e.status = 'pending'
    ORDER BY e.id DESC
  `).all();
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT 5').all();

  res.render('admin/dashboard', {
    user: req.session.user,
    students,
    applicants,
    courses,
    pendingEnrollments,
    announcements
  });
});

router.post('/update-student', authorize('admin'), (req, res) => {
  const { student_id, full_name, email, program, status } = req.body;
  const student = db.prepare('SELECT user_id FROM students WHERE id = ?').get(student_id);
  db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?').run(full_name, email, student.user_id);
  db.prepare('UPDATE students SET program = ?, status = ? WHERE id = ?').run(program, status, student_id);
  res.redirect('/admin/dashboard');
});

router.post('/approve-application', authorize('admin'), (req, res) => {
  const { applicant_id, rejection_reason } = req.body;
  const applicant = db.prepare('SELECT u.full_name, u.email, u.id AS user_id, a.program_choice, a.national_id FROM applicants a JOIN users u ON u.id = a.user_id WHERE a.id = ?').get(applicant_id);
  const studentNumber = `STU-${new Date().toISOString().slice(0,10).replace(/-/g, '')}-${(applicant.national_id || applicant.user_id).toString().slice(-4)}`;
  db.prepare('UPDATE applicants SET status = ?, student_number = ?, rejection_reason = ? WHERE id = ?').run('accepted', studentNumber, '', applicant_id);
  const existingStudent = db.prepare('SELECT id FROM students WHERE user_id = ?').get(applicant.user_id);
  if (!existingStudent) {
    db.prepare('INSERT INTO students (user_id, student_code, student_number, program, year_of_study, tuition_balance, portal_access) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(applicant.user_id, `STU${applicant.user_id}`, studentNumber, applicant.program_choice, 1, 250, 'blocked');
  } else {
    db.prepare('UPDATE students SET student_number = ?, program = ?, portal_access = ? WHERE user_id = ?').run(studentNumber, applicant.program_choice, 'blocked', applicant.user_id);
  }
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(applicant.user_id, 'Admission Accepted', `Congratulations ${applicant.full_name}! Your application has been accepted. Your student number is ${studentNumber}.`, 'email');
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(applicant.user_id, 'Admission Accepted SMS', `Your application has been accepted. Your student number is ${studentNumber}.`, 'sms');
  res.redirect('/admin/dashboard');
});

router.post('/reject-application', authorize('admin'), (req, res) => {
  const { applicant_id, rejection_reason } = req.body;
  const applicant = db.prepare('SELECT u.full_name, u.email, u.id AS user_id FROM applicants a JOIN users u ON u.id = a.user_id WHERE a.id = ?').get(applicant_id);
  db.prepare('UPDATE applicants SET status = ?, rejection_reason = ? WHERE id = ?').run('rejected', rejection_reason || 'Application did not meet requirements.', applicant_id);
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(applicant.user_id, 'Application Rejected', `Your application was rejected. Reason: ${rejection_reason || 'Application did not meet requirements.'}`, 'email');
  db.prepare('INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)')
    .run(applicant.user_id, 'Application Rejected SMS', `Your application was rejected. Reason: ${rejection_reason || 'Application did not meet requirements.'}`, 'sms');
  res.redirect('/admin/dashboard');
});

router.post('/approve-enrollment', authorize('admin'), (req, res) => {
  const { enrollment_id } = req.body;
  db.prepare('UPDATE enrollments SET status = ? WHERE id = ?').run('approved', enrollment_id);
  res.redirect('/admin/dashboard');
});

router.post('/reject-enrollment', authorize('admin'), (req, res) => {
  const { enrollment_id } = req.body;
  db.prepare('UPDATE enrollments SET status = ? WHERE id = ?').run('rejected', enrollment_id);
  res.redirect('/admin/dashboard');
});

router.post('/create-course', authorize('admin'), (req, res) => {
  const { code, name, credits, semester, prerequisite } = req.body;
  db.prepare('INSERT INTO courses (code, name, credits, semester, prerequisite) VALUES (?, ?, ?, ?, ?)')
    .run(code, name, credits, semester, prerequisite);
  res.redirect('/admin/dashboard');
});

router.post('/publish-announcement', authorize('admin'), (req, res) => {
  const { title, body } = req.body;
  db.prepare('INSERT INTO announcements (title, body) VALUES (?, ?)').run(title, body);
  res.redirect('/admin/dashboard');
});

module.exports = router;