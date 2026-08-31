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
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.pdf'].includes(ext));
  }
});

router.get('/dashboard', authorize('lecturer'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const materials = db.prepare(`
    SELECT m.*, u.full_name AS uploaded_by_name
    FROM materials m
    LEFT JOIN users u ON u.id = m.uploaded_by
    ORDER BY m.id DESC
  `).all();
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT 5').all();
  const students = db.prepare(`
    SELECT s.id, s.student_number, u.full_name
    FROM students s
    JOIN users u ON u.id = s.user_id
    ORDER BY u.full_name
  `).all();
  const courses = db.prepare('SELECT id, code, name FROM courses ORDER BY code').all();
  const assessments = db.prepare(`
    SELECT ca.student_id, ca.course_id, ca.semester,
      MAX(CASE WHEN ca.assessment_type = 'assignment' AND ca.assessment_number = 1 THEN ca.score END) AS assignment_one,
      MAX(CASE WHEN ca.assessment_type = 'assignment' AND ca.assessment_number = 2 THEN ca.score END) AS assignment_two,
      MAX(CASE WHEN ca.assessment_type = 'quiz' AND ca.assessment_number = 1 THEN ca.score END) AS quiz_one,
      MAX(CASE WHEN ca.assessment_type = 'quiz' AND ca.assessment_number = 2 THEN ca.score END) AS quiz_two,
      MAX(CASE WHEN ca.assessment_type = 'test' THEN ca.score END) AS test_score,
      c.code, c.name, u.full_name AS student_name, s.student_number
    FROM continuous_assessments ca
    JOIN students s ON s.id = ca.student_id
    JOIN users u ON u.id = s.user_id
    JOIN courses c ON c.id = ca.course_id
    GROUP BY ca.student_id, ca.course_id, ca.semester
    ORDER BY ca.id DESC
  `).all();

  res.render('lecturer/dashboard', {
    user,
    materials,
    announcements,
    students,
    courses,
    assessments
  });
});

router.post('/upload-material', authorize('lecturer'), upload.single('material'), (req, res) => {
  if (!req.file) {
    return res.redirect('/lecturer/dashboard');
  }

  db.prepare('INSERT INTO materials (title, description, file_name, file_type, uploaded_by, uploaded_by_name, category) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.body.title || 'Lecture material', req.body.description || 'Course handout', req.file.filename, req.file.mimetype, req.session.user.id, req.session.user.full_name, req.body.category || 'General');

  res.redirect('/lecturer/dashboard');
});

router.post('/upload-ca', authorize('lecturer'), (req, res) => {
  const { student_id, course_id, assessment_type, assessment_number, score, semester } = req.body;
  const numericScore = Number(score);
  const assessmentNumber = Number(assessment_number);
  const maxScore = 8;
  const validNumber = assessment_type === 'test' ? assessmentNumber === 1 : [1, 2].includes(assessmentNumber);
  if (!student_id || !course_id || !semester || !['assignment', 'quiz', 'test'].includes(assessment_type)
    || !validNumber || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > maxScore) {
    return res.redirect('/lecturer/dashboard');
  }

  db.prepare(`
    INSERT INTO continuous_assessments (student_id, course_id, assessment_type, assessment_number, max_score, score, semester)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, course_id, assessment_type, assessment_number, semester)
    DO UPDATE SET max_score = excluded.max_score, score = excluded.score
  `).run(student_id, course_id, assessment_type, assessmentNumber, maxScore, numericScore, semester);
  res.redirect('/lecturer/dashboard');
});

router.post('/publish-announcement', authorize('lecturer'), (req, res) => {
  const { title, body } = req.body;
  db.prepare('INSERT INTO announcements (title, body) VALUES (?, ?)').run(title, body);
  res.redirect('/lecturer/dashboard');
});

module.exports = router;
