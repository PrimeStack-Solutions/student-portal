const express = require('express');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
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
    SELECT e.id, e.status, c.code, c.name, c.credits, c.prerequisite, g.grade, g.semester,
      COALESCE(ca.assignment_one, 0) + COALESCE(ca.assignment_two, 0) + COALESCE(ca.quiz_one, 0) + COALESCE(ca.quiz_two, 0) + COALESCE(ca.test_score, 0) AS ca_score,
      CASE WHEN COALESCE(ca.assignment_one, 0) + COALESCE(ca.assignment_two, 0) + COALESCE(ca.quiz_one, 0) + COALESCE(ca.quiz_two, 0) + COALESCE(ca.test_score, 0) >= 15 THEN 'Eligible' ELSE 'Disqualified' END AS exam_status
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    LEFT JOIN grades g ON g.student_id = ? AND g.course_id = c.id
    LEFT JOIN (
      SELECT student_id, course_id, semester,
        MAX(CASE WHEN assessment_type = 'assignment' AND assessment_number = 1 THEN score END) AS assignment_one,
        MAX(CASE WHEN assessment_type = 'assignment' AND assessment_number = 2 THEN score END) AS assignment_two,
        MAX(CASE WHEN assessment_type = 'quiz' AND assessment_number = 1 THEN score END) AS quiz_one,
        MAX(CASE WHEN assessment_type = 'quiz' AND assessment_number = 2 THEN score END) AS quiz_two,
        MAX(CASE WHEN assessment_type = 'test' THEN score END) AS test_score
      FROM continuous_assessments
      GROUP BY student_id, course_id, semester
    ) ca ON ca.student_id = e.student_id AND ca.course_id = e.course_id AND ca.semester = e.semester
    WHERE e.student_id = ?
    ORDER BY e.semester, c.code
  `).all(student.id, student.id);

  const courses = db.prepare('SELECT * FROM courses ORDER BY code').all();
  const payments = db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY id DESC').all(student.id);
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT 5').all();
  const materials = db.prepare('SELECT * FROM materials ORDER BY id DESC LIMIT 5').all();
  const documents = db.prepare('SELECT * FROM documents WHERE user_id = ? ORDER BY id DESC').all(req.session.user.id);
  const results = db.prepare(`
    SELECT g.semester, c.code, c.name, g.grade, g.final_exam_score
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

router.get('/registration', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const selectedSemester = req.query.semester || 'Semester 1';
  const semesters = ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4', 'Semester 5', 'Semester 6', 'Semester 7', 'Semester 8'];

  const enrollments = db.prepare(`
    SELECT e.id, e.status, e.semester, c.code, c.name, c.credits,
      g.grade,
      COALESCE(ca.assignment_one, 0) + COALESCE(ca.assignment_two, 0) + COALESCE(ca.quiz_one, 0) + COALESCE(ca.quiz_two, 0) + COALESCE(ca.test_score, 0) AS ca_score,
      CASE WHEN COALESCE(ca.assignment_one, 0) + COALESCE(ca.assignment_two, 0) + COALESCE(ca.quiz_one, 0) + COALESCE(ca.quiz_two, 0) + COALESCE(ca.test_score, 0) >= 15 THEN 'Eligible' ELSE 'Disqualified' END AS exam_status
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN grades g ON g.student_id = e.student_id AND g.course_id = e.course_id AND g.semester = e.semester
    LEFT JOIN (
      SELECT student_id, course_id, semester,
        MAX(CASE WHEN assessment_type = 'assignment' AND assessment_number = 1 THEN score END) AS assignment_one,
        MAX(CASE WHEN assessment_type = 'assignment' AND assessment_number = 2 THEN score END) AS assignment_two,
        MAX(CASE WHEN assessment_type = 'quiz' AND assessment_number = 1 THEN score END) AS quiz_one,
        MAX(CASE WHEN assessment_type = 'quiz' AND assessment_number = 2 THEN score END) AS quiz_two,
        MAX(CASE WHEN assessment_type = 'test' THEN score END) AS test_score
      FROM continuous_assessments
      GROUP BY student_id, course_id, semester
    ) ca ON ca.student_id = e.student_id AND ca.course_id = e.course_id AND ca.semester = e.semester
    WHERE e.student_id = ?
    ORDER BY e.semester, c.code
  `).all(student.id);

  const courses = db.prepare('SELECT * FROM courses WHERE semester = ? ORDER BY code').all(selectedSemester);

  res.render('student/registration', {
    user: userRow,
    student,
    enrollments,
    courses,
    semesters,
    selectedSemester,
    error: null,
    success: null
  });
});

router.get('/program-outline', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const semesters = ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4', 'Semester 5', 'Semester 6', 'Semester 7', 'Semester 8'];

  const coursesBySemester = semesters.map(semester => ({
    semester,
    courses: db.prepare('SELECT * FROM courses WHERE semester = ? ORDER BY code').all(semester)
  }));

  res.render('student/program-outline', {
    user: userRow,
    student,
    coursesBySemester,
    semesters
  });
});

router.get('/exam-registration', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const selectedSemester = req.query.semester || 'Semester 1';
  const semesters = ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4', 'Semester 5', 'Semester 6', 'Semester 7', 'Semester 8'];

  const examCourses = db.prepare(`
    SELECT e.id, e.course_id, e.semester, c.code, c.name, c.credits,
      COALESCE(ca.assignment_one, 0) + COALESCE(ca.assignment_two, 0) + COALESCE(ca.quiz_one, 0) + COALESCE(ca.quiz_two, 0) + COALESCE(ca.test_score, 0) AS ca_score,
      CASE WHEN COALESCE(ca.assignment_one, 0) + COALESCE(ca.assignment_two, 0) + COALESCE(ca.quiz_one, 0) + COALESCE(ca.quiz_two, 0) + COALESCE(ca.test_score, 0) >= 15 THEN 'Eligible' ELSE 'Disqualified' END AS exam_status
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN (
      SELECT student_id, course_id, semester,
        MAX(CASE WHEN assessment_type = 'assignment' AND assessment_number = 1 THEN score END) AS assignment_one,
        MAX(CASE WHEN assessment_type = 'assignment' AND assessment_number = 2 THEN score END) AS assignment_two,
        MAX(CASE WHEN assessment_type = 'quiz' AND assessment_number = 1 THEN score END) AS quiz_one,
        MAX(CASE WHEN assessment_type = 'quiz' AND assessment_number = 2 THEN score END) AS quiz_two,
        MAX(CASE WHEN assessment_type = 'test' THEN score END) AS test_score
      FROM continuous_assessments
      GROUP BY student_id, course_id, semester
    ) ca ON ca.student_id = e.student_id AND ca.course_id = e.course_id AND ca.semester = e.semester
    WHERE e.student_id = ? AND e.semester = ?
    ORDER BY c.code
  `).all(student.id, selectedSemester);

  const registeredExams = db.prepare(`
    SELECT er.id, er.semester, c.code, c.name, er.status
    FROM exam_registrations er
    JOIN courses c ON c.id = er.course_id
    WHERE er.student_id = ?
    ORDER BY er.semester, c.code
  `).all(student.id);

  res.render('student/exam-registration', {
    user: userRow,
    student,
    examCourses,
    registeredExams,
    semesters,
    selectedSemester
  });
});

router.post('/register-exam', authorize('student'), (req, res) => {
  const { course_id, semester } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);

  if (!course_id || !semester) {
    return res.redirect('/student/exam-registration');
  }

  db.prepare('INSERT OR IGNORE INTO exam_registrations (student_id, course_id, semester, status) VALUES (?, ?, ?, ?)')
    .run(student.id, course_id, semester, 'registered');

  res.redirect(`/student/exam-registration?semester=${encodeURIComponent(semester)}`);
});

router.post('/cancel-exam-registration', authorize('student'), (req, res) => {
  const { exam_id } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);

  if (exam_id) {
    db.prepare('DELETE FROM exam_registrations WHERE id = ? AND student_id = ?').run(exam_id, student.id);
  }

  res.redirect('/student/exam-registration');
});

router.get('/announcements', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC').all();
  res.render('student/announcements', { user: userRow, student, announcements });
});

router.get('/courses', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const selectedSemester = req.query.semester || 'all';
  const semesters = db.prepare('SELECT DISTINCT semester FROM enrollments WHERE student_id = ? ORDER BY semester')
    .all(student.id)
    .map(item => item.semester)
    .filter(Boolean);
  let query = `
    SELECT e.id, e.status, e.semester, c.code, c.name, c.credits,
      g.grade,
      COALESCE(ca.assignment_one, 0) + COALESCE(ca.assignment_two, 0) + COALESCE(ca.quiz_one, 0) + COALESCE(ca.quiz_two, 0) + COALESCE(ca.test_score, 0) AS ca_score,
      CASE WHEN COALESCE(ca.assignment_one, 0) + COALESCE(ca.assignment_two, 0) + COALESCE(ca.quiz_one, 0) + COALESCE(ca.quiz_two, 0) + COALESCE(ca.test_score, 0) >= 15 THEN 'Eligible' ELSE 'Disqualified' END AS exam_status
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN grades g ON g.student_id = e.student_id AND g.course_id = e.course_id AND g.semester = e.semester
    LEFT JOIN (
      SELECT student_id, course_id, semester,
        MAX(CASE WHEN assessment_type = 'assignment' AND assessment_number = 1 THEN score END) AS assignment_one,
        MAX(CASE WHEN assessment_type = 'assignment' AND assessment_number = 2 THEN score END) AS assignment_two,
        MAX(CASE WHEN assessment_type = 'quiz' AND assessment_number = 1 THEN score END) AS quiz_one,
        MAX(CASE WHEN assessment_type = 'quiz' AND assessment_number = 2 THEN score END) AS quiz_two,
        MAX(CASE WHEN assessment_type = 'test' THEN score END) AS test_score
      FROM continuous_assessments
      GROUP BY student_id, course_id, semester
    ) ca ON ca.student_id = e.student_id AND ca.course_id = e.course_id AND ca.semester = e.semester
    WHERE e.student_id = ?
  `;
  const params = [student.id];
  if (selectedSemester !== 'all') {
    query += ' AND e.semester = ?';
    params.push(selectedSemester);
  }
  query += ' ORDER BY e.semester, c.code';

  const courses = db.prepare(query).all(...params);
  res.render('student/courses', { user: userRow, student, courses, semesters, selectedSemester });
});

router.get('/results', authorize('student'), (req, res) => {
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const selectedSemester = req.query.semester || 'all';

  let query = `
    SELECT g.semester, c.code, c.name, g.grade, g.final_exam_score
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
    success: null,
    avatarInitials: (userRow.full_name || 'S').split(' ').slice(0, 2).map(name => name.charAt(0)).join('').toUpperCase()
  });
});

router.post('/change-password', authorize('student'), (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
    return res.render('student/profile', {
      user,
      student,
      error: 'Current password is incorrect.',
      success: null,
      avatarInitials: (user.full_name || 'S').split(' ').slice(0, 2).map(name => name.charAt(0)).join('').toUpperCase()
    });
  }

  if (!new_password || new_password.length < 6) {
    const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
    return res.render('student/profile', {
      user,
      student,
      error: 'New password must be at least 6 characters long.',
      success: null,
      avatarInitials: (user.full_name || 'S').split(' ').slice(0, 2).map(name => name.charAt(0)).join('').toUpperCase()
    });
  }

  if (new_password !== confirm_password) {
    const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
    return res.render('student/profile', {
      user,
      student,
      error: 'New password and confirmation do not match.',
      success: null,
      avatarInitials: (user.full_name || 'S').split(' ').slice(0, 2).map(name => name.charAt(0)).join('').toUpperCase()
    });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), user.id);

  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  res.render('student/profile', {
    user: { ...user, full_name: user.full_name, email: user.email },
    student,
    error: null,
    success: 'Password changed successfully.',
    avatarInitials: (user.full_name || 'S').split(' ').slice(0, 2).map(name => name.charAt(0)).join('').toUpperCase()
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
    .run(student.id, course_id, semester, 'approved');
  res.redirect('/student/dashboard');
});

router.post('/upload-tuition-receipt', authorize('student'), receiptUpload.single('receipt'), (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.session.user.id);
  const redirectPath = student && student.portal_access === 'blocked' ? '/student/blocked' : '/student/dashboard';

  if (!req.file) {
    return res.redirect(redirectPath);
  }

  db.prepare('UPDATE students SET tuition_receipt_file = ?, tuition_receipt_status = ? WHERE id = ?')
    .run(req.file.filename, 'pending', student.id);
  res.redirect(redirectPath);
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

module.exports = router;