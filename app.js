const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');
const accountantRoutes = require('./routes/accountant');
const applicantRoutes = require('./routes/applicant');
const db = require('./database/setup');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'student-portal-secret-key',
  resave: false,
  saveUninitialized: false
}));

app.use('/', authRoutes);
app.use('/student', studentRoutes);
app.use('/admin', adminRoutes);
app.use('/accountant', accountantRoutes);
app.use('/applicant', applicantRoutes);

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/api/courses', (req, res) => {
  const courses = db.prepare('SELECT * FROM courses ORDER BY code').all();
  res.json(courses);
});

app.get('/api/programs', (req, res) => {
  res.json([
    { school: 'School of Engineering', programs: ['Bachelor of Computer Engineering', 'Bachelor of Electrical Engineering', 'Bachelor of Mechanical Engineering'], intakes: ['January', 'July'] },
    { school: 'School of Law', programs: ['Bachelor of Commercial Law', 'Bachelor of International Law', 'Bachelor of Human Rights Law'], intakes: ['January', 'July'] },
    { school: 'School of Humanities', programs: ['Bachelor of English Literature', 'Bachelor of History and International Studies', 'Bachelor of Communication Studies'], intakes: ['January', 'July'] },
    { school: 'School of Business', programs: ['Bachelor of Accounting', 'Bachelor of Marketing', 'Bachelor of Business Administration'], intakes: ['January', 'July'] },
    { school: 'School of Natural Sciences', programs: ['Bachelor of Biology', 'Bachelor of Chemistry', 'Bachelor of Physics'], intakes: ['January', 'July'] },
    { school: 'School of Public Health', programs: ['Bachelor of Public Health', 'Bachelor of Epidemiology'], intakes: ['January', 'July'] },
    { school: 'School of Medicine and Surgery', programs: ['Bachelor of Medicine and Surgery', 'Bachelor of Nursing'], intakes: ['January', 'July'] }
  ]);
});

app.get('/api/students', (req, res) => {
  const students = db.prepare(`
    SELECT u.id, u.full_name, u.email, s.program, s.student_code, s.status
    FROM users u
    JOIN students s ON s.user_id = u.id
    WHERE u.role = 'student'
  `).all();
  res.json(students);
});

app.get('/api/applications', (req, res) => {
  const applications = db.prepare(`
    SELECT a.id, a.status, a.program_choice, a.intake, u.full_name, u.email
    FROM applicants a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.id DESC
  `).all();
  res.json(applications);
});

app.post('/api/applications', (req, res) => {
  const { user_id, program_choice, intake, status } = req.body;
  const result = db.prepare('INSERT INTO applicants (user_id, program_choice, intake, status) VALUES (?, ?, ?, ?)')
    .run(user_id, program_choice, intake, status || 'submitted');
  res.json({ id: result.lastInsertRowid, message: 'Application recorded' });
});

app.listen(PORT, () => {
  console.log(`Student Portal running at http://localhost:${PORT}`);
});