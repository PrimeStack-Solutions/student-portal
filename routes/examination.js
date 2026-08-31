const express = require('express');
const db = require('../database/setup');
const { authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', authorize('examination'), (req, res) => {
  const students = db.prepare(`
    SELECT s.id, s.student_number, u.full_name
    FROM students s
    JOIN users u ON u.id = s.user_id
    ORDER BY u.full_name
  `).all();
  const courses = db.prepare('SELECT id, code, name FROM courses ORDER BY code').all();
  const results = db.prepare(`
    SELECT g.id, u.full_name AS student_name, s.student_number, c.code, c.name,
           g.grade, g.gpa, g.semester
    FROM grades g
    JOIN students s ON s.id = g.student_id
    JOIN users u ON u.id = s.user_id
    JOIN courses c ON c.id = g.course_id
    ORDER BY g.id DESC
  `).all();

  res.render('examination/dashboard', {
    user: req.session.user,
    students,
    courses,
    results
  });
});

router.post('/upload-result', authorize('examination'), (req, res) => {
  const { student_id, course_id, grade, gpa, semester } = req.body;
  if (!student_id || !course_id || !grade || !semester || !Number.isFinite(Number(gpa))) {
    return res.redirect('/examination/dashboard');
  }

  const existing = db.prepare('SELECT id FROM grades WHERE student_id = ? AND course_id = ? AND semester = ?')
    .get(student_id, course_id, semester);
  if (existing) {
    db.prepare('UPDATE grades SET grade = ?, gpa = ? WHERE id = ?').run(grade, Number(gpa), existing.id);
  } else {
    db.prepare('INSERT INTO grades (student_id, course_id, grade, gpa, semester) VALUES (?, ?, ?, ?, ?)')
      .run(student_id, course_id, grade, Number(gpa), semester);
  }

  res.redirect('/examination/dashboard');
});

module.exports = router;
