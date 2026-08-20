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
const pdfFilter = (req, file, cb) => {
  const allowedExt = ['.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, allowedExt.includes(ext));
};
const materialUpload = multer({ storage: upload.storage, fileFilter: pdfFilter });
const assignmentFilter = (req, file, cb) => {
  const allowedExt = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, allowedExt.includes(ext));
};
const receiptUpload = multer({ storage: upload.storage, fileFilter: pdfFilter });
const balanceReceiptUpload = multer({ storage: upload.storage, fileFilter: pdfFilter });
const assignmentUpload = multer({ storage: upload.storage, fileFilter: assignmentFilter });

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
  const materials = db.prepare('SELECT * FROM materials ORDER BY id DESC LIMIT 5').all();
  const documents = db.prepare('SELECT * FROM documents WHERE user_id = ? ORDER BY id DESC').all(req.session.user.id);
  const results = db.prepare(`
    SELECT g.semester, c.code, c.name, g.grade, g.gpa
    FROM grades g
    JOIN courses c ON c.id = g.course_id
    WHERE g.student_id = ?
    ORDER BY g.semester, c.code
  `).all(student.id);
  const totalAnnouncements = db.prepare('SELECT COUNT(*) AS total FROM announcements').get().total;
  const totalResults = db.prepare('SELECT COUNT(*) AS total FROM grades WHERE student_id = ?').get(student.id).total;
  const totalMaterials = db.prepare('SELECT COUNT(*) AS total FROM materials').get().total;

  res.render('student/dashboard', {
    user: userRow,
    student,
    enrollments,
    courses,
    payments,
    announcements,
    materials,
    documents,
    results,
    stats: {
      announcements: totalAnnouncements,
      results: totalResults,
      materials: totalMaterials,
      balance: Number(student.tuition_balance || 0)
    },
    error: null,
    success: null
  });
});

router.get('/announcements', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC').all();
  res.render('student/announcements', { user: userRow, student, announcements });
});

router.get('/results', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const selectedSemester = req.query.semester || 'all';

  let query = `
    SELECT g.semester, c.code, c.name, g.grade, g.gpa
    FROM grades g
    JOIN courses c ON c.id = g.course_id
    WHERE g.student_id = ?
  `;
  const params = [student.id];

  if (selectedSemester !== 'all') {
    query += ' AND g.semester = ?';
    params.push(selectedSemester);
  }

  query += ' ORDER BY g.semester, c.code';

  const results = db.prepare(query).all(...params);
  const semesters = [...new Set(results.map(item => item.semester).filter(Boolean))].sort();

  const groupedResults = results.reduce((acc, result) => {
    const semester = result.semester || 'Unspecified';
    if (!acc[semester]) acc[semester] = [];
    acc[semester].push(result);
    return acc;
  }, {});

  res.render('student/results', {
    user: userRow,
    student,
    groupedResults,
    results,
    semesters,
    selectedSemester
  });
});

router.get('/materials', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const materials = db.prepare(`
    SELECT m.*, u.full_name AS uploaded_by_name
    FROM materials m
    LEFT JOIN users u ON u.id = m.uploaded_by
    ORDER BY m.id DESC
  `).all();

  res.render('student/materials', {
    user: userRow,
    student,
    materials,
    canUploadMaterial: ['lecturer', 'admin'].includes(userRow.role)
  });
});

router.get('/payments', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const payments = db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY id DESC').all(student.id);
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const balanceDue = Math.max(0, Number(student.tuition_balance || 0));
  const semesterFee = 250;

  res.render('student/payments', {
    user: userRow,
    student,
    payments,
    totalPaid,
    balanceDue,
    semesterFee
  });
});

router.get('/profile', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);

  res.render('student/profile', {
    user: userRow,
    student,
    error: null,
    success: null
  });
});

router.post('/register-semester', authorize('student'), (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const semester = req.body.semester || 'Semester 1';
  const amount = Number(req.body.amount || 250);

  db.prepare('INSERT INTO payments (student_id, amount, payment_date, status, purpose) VALUES (?, ?, ?, ?, ?)')
    .run(student.id, amount, new Date().toISOString(), 'completed', `Semester registration - ${semester}`);

  const updatedBalance = Math.max(0, Number(student.tuition_balance || 0) - amount);
  db.prepare('UPDATE students SET tuition_balance = ? WHERE id = ?').run(updatedBalance, student.id);

  res.redirect('/student/payments');
});

router.post('/pay-balance', authorize('student'), (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const amount = Number(req.body.amount || 0);

  if (!amount || amount <= 0) {
    return res.redirect('/student/payments');
  }

  const availableBalance = Number(student.tuition_balance || 0);
  const actualPayment = Math.min(amount, availableBalance);
  db.prepare('INSERT INTO payments (student_id, amount, payment_date, status, purpose) VALUES (?, ?, ?, ?, ?)')
    .run(student.id, actualPayment, new Date().toISOString(), 'pending', 'Balance payment');

  db.prepare('UPDATE students SET tuition_balance = ?, balance_payment_amount = ?, balance_payment_reference = ?, balance_payment_status = ? WHERE id = ?')
    .run(availableBalance, actualPayment, req.body.reference || 'Manual balance payment', 'pending', student.id);

  res.redirect('/student/payments');
});

router.post('/upload-balance-payment-receipt', authorize('student'), balanceReceiptUpload.single('balance_receipt'), (req, res) => {
  if (!req.file) {
    return res.redirect('/student/payments');
  }

  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  db.prepare('UPDATE students SET balance_payment_receipt_file = ?, balance_payment_status = ?, balance_payment_reference = ?, balance_payment_amount = ? WHERE id = ?')
    .run(req.file.filename, 'pending', req.body.reference || 'Balance payment receipt', Number(req.body.amount || 0), student.id);

  res.redirect('/student/payments');
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

router.post('/upload-tuition-receipt', authorize('student'), receiptUpload.single('receipt'), (req, res) => {
  if (!req.file) {
    return res.redirect('/student/dashboard');
  }

  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  db.prepare('UPDATE students SET tuition_receipt_file = ?, tuition_receipt_status = ? WHERE id = ?')
    .run(req.file.filename, 'pending', student.id);
  res.redirect('/student/dashboard');
});

router.post('/upload-assignment', authorize('student'), assignmentUpload.single('assignment'), (req, res) => {
  if (!req.file) {
    return res.redirect('/student/dashboard');
  }

  db.prepare('INSERT INTO documents (user_id, title, file_name, file_type) VALUES (?, ?, ?, ?)')
    .run(req.session.user.id, req.body.title || 'Assignment submission', req.file.filename, 'assignment');
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

router.post('/upload-material', authorize('student'), materialUpload.single('material'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!['lecturer', 'admin'].includes(user.role)) {
    return res.status(403).render('forbidden', { user });
  }

  if (!req.file) {
    return res.redirect('/student/materials');
  }

  db.prepare('INSERT INTO materials (title, description, file_name, file_type, uploaded_by, uploaded_by_name, category) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.body.title || 'Study material', req.body.description || 'Shared learning resource', req.file.filename, req.file.mimetype, user.id, user.full_name, req.body.category || 'General');
  res.redirect('/student/materials');
});

module.exports = router;