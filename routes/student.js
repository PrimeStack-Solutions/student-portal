const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../database/setup');
const { authorize } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`)
  })
});

router.get('/dashboard', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  let student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);

  if (!student) {
    const result = db.prepare('INSERT INTO students (user_id, student_code, program, year_of_study, tuition_balance, portal_access) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.session.user.id, `STU${req.session.user.id}`, 'General Studies', 1, 0, 'blocked');
    student = db.prepare('SELECT * FROM students WHERE id = ?').get(result.lastInsertRowid);
  }

  if (student.portal_access === 'blocked') {
    return res.redirect('/student/blocked');
  }

  const enrollments = db.prepare(`
    SELECT e.id, e.status, c.code, c.name, c.credits, c.prerequisite, g.grade, g.semester
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    LEFT JOIN grades g ON g.student_id = ? AND g.course_id = c.id
    WHERE e.student_id = ?
    ORDER BY e.semester, c.code
  `).all(student.id, student.id);

  const courses = db.prepare('SELECT * FROM courses ORDER BY code').all();
  const payments = db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY id DESC').all(student.id);
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT 5').all();
  const documents = db.prepare('SELECT * FROM documents WHERE user_id = ? ORDER BY id DESC').all(req.session.user.id);
  const results = db.prepare(`
    SELECT g.semester, c.code, c.name, g.grade, g.gpa
    FROM grades g
    JOIN courses c ON c.id = g.course_id
    WHERE g.student_id = ?
    ORDER BY g.semester, c.code
  `).all(student.id);

  res.render('student/dashboard', {
    user: userRow,
    student,
    enrollments,
    courses,
    payments,
    announcements,
    documents,
    results,
    error: null,
    success: null
  });
});

router.get('/blocked', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  res.render('student/blocked', { user: userRow, student });
});

router.post('/profile', authorize('student'), (req, res) => {
  const { full_name, email, phone, address, program, year_of_study } = req.body;
  db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?').run(full_name, email, req.session.user.id);
  db.prepare('UPDATE students SET program = ?, year_of_study = ?, phone = ?, address = ? WHERE user_id = ?').run(program, year_of_study, phone, address, req.session.user.id);
  req.session.user.full_name = full_name;
  req.session.user.email = email;
  res.redirect('/student/dashboard');
});

router.post('/register-course', authorize('student'), (req, res) => {
  const { course_id, semester } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  db.prepare('INSERT INTO enrollments (student_id, course_id, semester, status) VALUES (?, ?, ?, ?)')
    .run(student.id, course_id, semester, 'pending');
  res.redirect('/student/dashboard');
});

router.post('/upload-tuition-receipt', authorize('student'), upload.single('receipt'), (req, res) => {
  if (!req.file) {
    return res.redirect('/student/dashboard');
  }

  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  db.prepare('UPDATE students SET tuition_receipt_file = ?, tuition_receipt_status = ? WHERE id = ?')
    .run(req.file.filename, 'pending', student.id);
  res.redirect('/student/dashboard');
});

router.post('/drop-course', authorize('student'), (req, res) => {
  const { enrollment_id } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  db.prepare('DELETE FROM enrollments WHERE id = ? AND student_id = ?').run(enrollment_id, student.id);
  res.redirect('/student/dashboard');
});

router.post('/upload-document', authorize('student'), upload.single('doc'), (req, res) => {
  if (!req.file) {
    return res.redirect('/student/dashboard');
  }

  db.prepare('INSERT INTO documents (user_id, title, file_name, file_type) VALUES (?, ?, ?, ?)')
    .run(req.session.user.id, req.body.title || 'Uploaded document', req.file.filename, req.file.mimetype);
  res.redirect('/student/dashboard');
});

module.exports = router;