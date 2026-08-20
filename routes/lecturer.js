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

  res.render('lecturer/dashboard', {
    user,
    materials,
    announcements
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

router.post('/publish-announcement', authorize('lecturer'), (req, res) => {
  const { title, body } = req.body;
  db.prepare('INSERT INTO announcements (title, body) VALUES (?, ?)').run(title, body);
  res.redirect('/lecturer/dashboard');
});

module.exports = router;
