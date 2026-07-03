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

router.get('/dashboard', authorize('applicant'), (req, res) => {
  const applicant = db.prepare(`
    SELECT a.*, u.full_name, u.email
    FROM applicants a
    JOIN users u ON a.user_id = u.id
    WHERE u.id = ?
  `).get(req.session.user.id);
  const documents = db.prepare('SELECT * FROM documents WHERE user_id = ? ORDER BY id DESC').all(req.session.user.id);
  res.render('applicant/dashboard', { user: req.session.user, applicant, documents, error: null, success: null });
});

router.post('/apply', authorize('applicant'), upload.array('documents', 5), (req, res) => {
  const { full_name, contact_details, program_choice, intake, study_mode, notes } = req.body;
  db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(full_name, req.session.user.id);
  db.prepare('UPDATE applicants SET program_choice = ?, intake = ?, study_mode = ?, status = ?, notes = ? WHERE user_id = ?')
    .run(program_choice, intake, study_mode || 'Full-time', 'submitted', `${notes || ''} | Contact: ${contact_details} | Study Mode: ${study_mode || 'Full-time'}`, req.session.user.id);

  if (req.files && req.files.length) {
    const insertDocument = db.prepare('INSERT INTO documents (user_id, title, file_name, file_type) VALUES (?, ?, ?, ?)');
    req.files.forEach((file) => insertDocument.run(req.session.user.id, file.originalname, file.filename, 'application'));
  }

  res.redirect('/applicant/dashboard');
});

router.post('/pay-fee', authorize('applicant'), (req, res) => {
  db.prepare('UPDATE applicants SET application_fee_paid = ? WHERE user_id = ?').run(1, req.session.user.id);
  res.redirect('/applicant/dashboard');
});

module.exports = router;
