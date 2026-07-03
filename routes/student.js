const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { authorize } = require('../middleware/auth');

const router = express.Router();
const db = new Database(path.join(__dirname, '..', 'database', 'portal.db'));

router.get('/dashboard', authorize('student'), (req, res) => {
  // Query enrolled courses and grades for this student
  const enrollments = db.prepare(`
    SELECT courses.code, courses.name, enrollments.grade
    FROM enrollments
    JOIN courses ON enrollments.course_id = courses.id
    WHERE enrollments.user_id = ?
  `).all(req.session.user.id);

  res.render('student/dashboard', {
    user: req.session.user,
    enrollments: enrollments
  });
});

module.exports = router;