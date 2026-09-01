const express = require('express');
const db = require('../database/setup');
const { authorize } = require('../middleware/auth');

const router = express.Router();

function calculateGrade(total) {
  if (total >= 90) return 'A+';
  if (total >= 80) return 'A';
  if (total >= 70) return 'B+';
  if (total >= 60) return 'B';
  if (total >= 50) return 'C+';
  if (total >= 40) return 'C';
  if (total >= 30) return 'D+';
  return 'D';
}

function hasExamRegistration(studentId, courseId, semester) {
  return !!db.prepare('SELECT 1 FROM exam_registrations WHERE student_id = ? AND course_id = ? AND semester = ? LIMIT 1')
    .get(studentId, courseId, semester);
}

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
           g.grade, g.final_exam_score, g.semester
    FROM grades g
    JOIN students s ON s.id = g.student_id
    JOIN users u ON u.id = s.user_id
    JOIN courses c ON c.id = g.course_id
    ORDER BY g.id DESC
  `).all();
  const excludedStudents = db.prepare(`
    SELECT g.id, u.full_name AS student_name, s.student_number, c.code, c.name, g.semester
    FROM grades g
    JOIN students s ON s.id = g.student_id
    JOIN users u ON u.id = s.user_id
    JOIN courses c ON c.id = g.course_id
    WHERE g.grade = 'E'
    ORDER BY u.full_name, c.code
  `).all();

  res.render('examination/dashboard', {
    user: req.session.user,
    students,
    courses,
    results,
    excludedStudents
  });
});

router.post('/revoke-exclusion', authorize('examination'), (req, res) => {
  db.prepare("DELETE FROM grades WHERE id = ? AND grade = 'E'").run(req.body.result_id);
  res.redirect('/examination/dashboard');
});

router.post('/upload-result', authorize('examination'), (req, res) => {
  const { student_id, course_id, final_exam_score, semester, special_case_e } = req.body;
  if (!student_id || !course_id || !semester || !hasExamRegistration(student_id, course_id, semester)) {
    return res.redirect('/examination/dashboard');
  }

  if (special_case_e === 'on') {
    const existingSpecialResult = db.prepare('SELECT id FROM grades WHERE student_id = ? AND course_id = ? AND semester = ?')
      .get(student_id, course_id, semester);
    if (existingSpecialResult) {
      db.prepare('UPDATE grades SET grade = ?, final_exam_score = NULL WHERE id = ?')
        .run('E', existingSpecialResult.id);
    } else {
      db.prepare('INSERT INTO grades (student_id, course_id, grade, final_exam_score, semester) VALUES (?, ?, ?, NULL, ?)')
        .run(student_id, course_id, 'E', semester);
    }
    return res.redirect('/examination/dashboard');
  }

  const examScore = Number(final_exam_score);
  if (!Number.isFinite(examScore) || examScore < 0 || examScore > 60) {
    return res.redirect('/examination/dashboard');
  }

  const ca = db.prepare(`
    SELECT COALESCE(SUM(score), 0) AS score
    FROM continuous_assessments
    WHERE student_id = ? AND course_id = ? AND semester = ?
  `).get(student_id, course_id, semester);
  const caScore = Number(ca.score);
  const grade = caScore < 15 ? 'D' : calculateGrade(caScore + examScore);

  const existing = db.prepare('SELECT id FROM grades WHERE student_id = ? AND course_id = ? AND semester = ?')
    .get(student_id, course_id, semester);
  if (existing) {
    db.prepare('UPDATE grades SET grade = ?, final_exam_score = ? WHERE id = ?')
      .run(grade, examScore, existing.id);
  } else {
    db.prepare('INSERT INTO grades (student_id, course_id, grade, final_exam_score, semester) VALUES (?, ?, ?, ?, ?)')
      .run(student_id, course_id, grade, examScore, semester);
  }

  res.redirect('/examination/dashboard');
});

module.exports = router;
