const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'portal.db');
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'accountant', 'admin', 'applicant')),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS applicants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    program_choice TEXT DEFAULT 'Undecided',
    intake TEXT DEFAULT 'Fall 2026',
    study_mode TEXT DEFAULT 'Full-time',
    nationality TEXT DEFAULT 'Not specified',
    national_id TEXT DEFAULT '',
    student_number TEXT DEFAULT '',
    status TEXT DEFAULT 'submitted',
    documents TEXT DEFAULT '',
    application_fee_paid INTEGER DEFAULT 0,
    application_receipt_file TEXT DEFAULT '',
    application_receipt_status TEXT DEFAULT 'pending',
    notes TEXT DEFAULT '',
    rejection_reason TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    student_code TEXT DEFAULT '',
    student_number TEXT DEFAULT '',
    program TEXT DEFAULT 'General Studies',
    year_of_study INTEGER DEFAULT 1,
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    gpa REAL DEFAULT 0,
    tuition_balance REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    portal_access TEXT DEFAULT 'blocked',
    tuition_receipt_file TEXT DEFAULT '',
    tuition_receipt_status TEXT DEFAULT 'pending',
    tuition_rejection_reason TEXT DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    credits INTEGER DEFAULT 3,
    semester TEXT DEFAULT 'Fall',
    prerequisite TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    semester TEXT DEFAULT 'Fall',
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );

  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT DEFAULT 'N/A',
    gpa REAL DEFAULT 0,
    semester TEXT DEFAULT 'Fall',
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'completed',
    purpose TEXT DEFAULT 'Tuition',
    FOREIGN KEY (student_id) REFERENCES students(id)
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    department TEXT DEFAULT 'Admissions',
    role TEXT DEFAULT 'Manager',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS accountants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    department TEXT DEFAULT 'Finance',
    role TEXT DEFAULT 'Senior',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT DEFAULT 'application',
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    delivery_mode TEXT DEFAULT 'email',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const insertUser = db.prepare(`
  INSERT INTO users (username, password_hash, role, full_name, email)
  VALUES (?, ?, ?, ?, ?)
`);
const insertApplicant = db.prepare(`
  INSERT INTO applicants (user_id, program_choice, intake, study_mode, nationality, national_id, student_number, status, application_fee_paid, application_receipt_file, application_receipt_status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertStudent = db.prepare(`
  INSERT INTO students (user_id, student_code, student_number, program, year_of_study, phone, address, gpa, tuition_balance, status, portal_access, tuition_receipt_file, tuition_receipt_status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertNotification = db.prepare(`
  INSERT INTO notifications (user_id, title, message, delivery_mode) VALUES (?, ?, ?, ?)
`);
const insertAdmin = db.prepare(`
  INSERT INTO admins (user_id, department, role) VALUES (?, ?, ?)
`);
const insertAccountant = db.prepare(`
  INSERT INTO accountants (user_id, department, role) VALUES (?, ?, ?)
`);
const insertCourse = db.prepare(`
  INSERT OR IGNORE INTO courses (code, name, credits, semester, prerequisite) VALUES (?, ?, ?, ?, ?)
`);
const insertEnrollment = db.prepare(`
  INSERT OR IGNORE INTO enrollments (student_id, course_id, semester, status) VALUES (?, ?, ?, ?)
`);
const insertGrade = db.prepare(`
  INSERT OR IGNORE INTO grades (student_id, course_id, grade, gpa, semester) VALUES (?, ?, ?, ?, ?)
`);
const insertPayment = db.prepare(`
  INSERT OR IGNORE INTO payments (student_id, amount, payment_date, status, purpose) VALUES (?, ?, ?, ?, ?)
`);
const insertAnnouncement = db.prepare(`
  INSERT OR IGNORE INTO announcements (title, body) VALUES (?, ?)
`);

const passwordHash = bcrypt.hashSync('password123', 10);

function ensureUser(username, role, fullName, email) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return existing.id;
  }
  return insertUser.run(username, passwordHash, role, fullName, email).lastInsertRowid;
}

const johnId = ensureUser('john_student', 'student', 'John Smith', 'john@university.edu');
const janeId = ensureUser('jane_student', 'student', 'Jane Doe', 'jane@university.edu');
const bobId = ensureUser('bob_accountant', 'accountant', 'Bob Wilson', 'bob@university.edu');
const aliceId = ensureUser('alice_admin', 'admin', 'Alice Johnson', 'alice@university.edu');
const mayaId = ensureUser('maya_applicant', 'applicant', 'Maya Chen', 'maya@university.edu');

const existingApplicant = db.prepare('SELECT id FROM applicants WHERE user_id = ?').get(mayaId);
if (!existingApplicant) {
  insertApplicant.run(mayaId, 'Bachelor of Computer Engineering', 'January', 'Full-time', 'Kenyan', '12345678', 'STU-20260704-12345678', 'under review', 1, 'app-receipt.pdf', 'approved', 'Official transcript attached');
}

const existingStudentJohn = db.prepare('SELECT id FROM students WHERE user_id = ?').get(johnId);
if (!existingStudentJohn) {
  insertStudent.run(johnId, 'STU1001', 'STU-20260704-1001', 'Bachelor of Computer Engineering', 2, '+1 555-0101', '12 Elm Street', 3.7, 250, 'active', 'blocked', '', 'pending');
}

const existingStudentJane = db.prepare('SELECT id FROM students WHERE user_id = ?').get(janeId);
if (!existingStudentJane) {
  insertStudent.run(janeId, 'STU1002', 'STU-20260704-1002', 'Bachelor of Business Administration', 1, '+1 555-0102', '14 Oak Avenue', 3.2, 0, 'active', 'granted', 'tuition-receipt.pdf', 'approved');
}

const existingAdmin = db.prepare('SELECT id FROM admins WHERE user_id = ?').get(aliceId);
if (!existingAdmin) {
  insertAdmin.run(aliceId, 'Admissions', 'Director');
}

const existingAccountant = db.prepare('SELECT id FROM accountants WHERE user_id = ?').get(bobId);
if (!existingAccountant) {
  insertAccountant.run(bobId, 'Finance', 'Manager');
}

insertCourse.run('CS101', 'Introduction to Computer Science', 3, 'Fall', '');
insertCourse.run('CS201', 'Data Structures and Algorithms', 3, 'Fall', 'CS101');
insertCourse.run('CS301', 'Database Systems', 3, 'Spring', 'CS101');
insertCourse.run('MATH101', 'Calculus I', 4, 'Fall', '');

const johnStudentId = db.prepare('SELECT id FROM students WHERE user_id = ?').get(johnId).id;
const janeStudentId = db.prepare('SELECT id FROM students WHERE user_id = ?').get(janeId).id;
insertEnrollment.run(johnStudentId, 1, 'Fall', 'approved');
insertEnrollment.run(johnStudentId, 2, 'Fall', 'approved');
insertEnrollment.run(johnStudentId, 4, 'Fall', 'approved');
insertEnrollment.run(janeStudentId, 1, 'Fall', 'pending');
insertGrade.run(johnStudentId, 1, 'A', 4.0, 'Fall');
insertGrade.run(johnStudentId, 2, 'B+', 3.3, 'Fall');
insertGrade.run(johnStudentId, 4, 'A-', 3.7, 'Fall');
insertPayment.run(johnStudentId, 1500, '2026-06-01', 'completed', 'Tuition');
insertPayment.run(janeStudentId, 250, '2026-06-15', 'pending', 'Registration Fee');
insertAnnouncement.run('Welcome to the New SIS Portal', 'Please review your application status and stay up to date with deadlines.');
insertAnnouncement.run('Campus Update', 'The university will open the student services portal for new intake on July 10.');
insertNotification.run(johnId, 'Welcome', 'Your student portal access is pending tuition approval.', 'email');
insertNotification.run(johnId, 'Welcome SMS', 'Your student portal access is pending tuition approval.', 'sms');

console.log('Database setup complete! Sample data seeded.');
module.exports = db;