const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'portal.db');

if (fs.existsSync(dbPath)) {
  try {
    const legacyCheck = new Database(dbPath);
    const schemaRow = legacyCheck.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    legacyCheck.close();

    if (schemaRow && !(schemaRow.sql || '').includes("'examination'")) {
      fs.unlinkSync(dbPath);
    }
  } catch (error) {
    console.warn('Database schema check skipped:', error.message);
  }
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'accountant', 'admin', 'applicant', 'lecturer', 'examination')),
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
    study_mode TEXT DEFAULT 'Full-time',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    gpa REAL DEFAULT 0,
    tuition_balance REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    portal_access TEXT DEFAULT 'blocked',
    tuition_receipt_file TEXT DEFAULT '',
    tuition_receipt_status TEXT DEFAULT 'pending',
    tuition_rejection_reason TEXT DEFAULT '',
    balance_payment_receipt_file TEXT DEFAULT '',
    balance_payment_status TEXT DEFAULT 'not_required',
    balance_payment_amount REAL DEFAULT 0,
    balance_payment_reference TEXT DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS exam_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    semester TEXT DEFAULT 'Fall',
    status TEXT DEFAULT 'registered',
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

  CREATE TABLE IF NOT EXISTS continuous_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    assessment_type TEXT NOT NULL CHECK(assessment_type IN ('assignment', 'quiz', 'test')),
    assessment_number INTEGER NOT NULL DEFAULT 1,
    max_score REAL NOT NULL DEFAULT 20,
    score REAL NOT NULL CHECK(score >= 0 AND score <= 40),
    semester TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id, assessment_type, assessment_number, semester),
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

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    file_name TEXT NOT NULL,
    file_type TEXT DEFAULT 'application/pdf',
    uploaded_by INTEGER NOT NULL,
    uploaded_by_name TEXT DEFAULT '',
    category TEXT DEFAULT 'General',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
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

const assessmentSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'continuous_assessments'").get();
if (assessmentSchema && !(assessmentSchema.sql || '').includes('assessment_number')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    ALTER TABLE continuous_assessments RENAME TO continuous_assessments_legacy;
    CREATE TABLE continuous_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      assessment_type TEXT NOT NULL CHECK(assessment_type IN ('assignment', 'quiz', 'test')),
      assessment_number INTEGER NOT NULL DEFAULT 1,
      max_score REAL NOT NULL DEFAULT 20,
      score REAL NOT NULL CHECK(score >= 0 AND score <= 40),
      semester TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, course_id, assessment_type, assessment_number, semester),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );
    INSERT INTO continuous_assessments (id, student_id, course_id, assessment_type, assessment_number, max_score, score, semester, created_at)
      SELECT id, student_id, course_id, assessment_type, 1, 20, score, semester, created_at
      FROM continuous_assessments_legacy;
    DROP TABLE continuous_assessments_legacy;
  `);
  db.pragma('foreign_keys = ON');
}

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(col => col.name === column);
}

function addColumnIfMissing(table, columnName, definition) {
  if (!columnExists(table, columnName)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
  }
}

addColumnIfMissing('applicants', 'study_mode', "study_mode TEXT DEFAULT 'Full-time'");
addColumnIfMissing('applicants', 'nationality', "nationality TEXT DEFAULT 'Not specified'");
addColumnIfMissing('applicants', 'national_id', "national_id TEXT DEFAULT ''");
addColumnIfMissing('announcements', 'source', "source TEXT DEFAULT 'General'");
addColumnIfMissing('applicants', 'student_number', "student_number TEXT DEFAULT ''");
addColumnIfMissing('applicants', 'status', "status TEXT DEFAULT 'submitted'");
addColumnIfMissing('applicants', 'documents', "documents TEXT DEFAULT ''");
addColumnIfMissing('applicants', 'application_fee_paid', "application_fee_paid INTEGER DEFAULT 0");
addColumnIfMissing('applicants', 'application_receipt_file', "application_receipt_file TEXT DEFAULT ''");
addColumnIfMissing('applicants', 'application_receipt_status', "application_receipt_status TEXT DEFAULT 'pending'");
addColumnIfMissing('applicants', 'notes', "notes TEXT DEFAULT ''");
addColumnIfMissing('applicants', 'rejection_reason', "rejection_reason TEXT DEFAULT ''");
addColumnIfMissing('applicants', 'created_at', "created_at TEXT DEFAULT CURRENT_TIMESTAMP");

addColumnIfMissing('students', 'student_code', "student_code TEXT DEFAULT ''");
addColumnIfMissing('students', 'student_number', "student_number TEXT DEFAULT ''");
addColumnIfMissing('students', 'program', "program TEXT DEFAULT 'General Studies'");
addColumnIfMissing('students', 'year_of_study', "year_of_study INTEGER DEFAULT 1");
addColumnIfMissing('students', 'study_mode', "study_mode TEXT DEFAULT 'Full-time'");
addColumnIfMissing('students', 'phone', "phone TEXT DEFAULT ''");
addColumnIfMissing('students', 'address', "address TEXT DEFAULT ''");
addColumnIfMissing('students', 'gpa', "gpa REAL DEFAULT 0");
addColumnIfMissing('students', 'tuition_balance', "tuition_balance REAL DEFAULT 0");
addColumnIfMissing('students', 'status', "status TEXT DEFAULT 'active'");
addColumnIfMissing('students', 'portal_access', "portal_access TEXT DEFAULT 'blocked'");
addColumnIfMissing('students', 'tuition_receipt_file', "tuition_receipt_file TEXT DEFAULT ''");
addColumnIfMissing('students', 'tuition_receipt_status', "tuition_receipt_status TEXT DEFAULT 'pending'");
addColumnIfMissing('students', 'tuition_rejection_reason', "tuition_rejection_reason TEXT DEFAULT ''");
addColumnIfMissing('students', 'balance_payment_receipt_file', "balance_payment_receipt_file TEXT DEFAULT ''");
addColumnIfMissing('students', 'balance_payment_status', "balance_payment_status TEXT DEFAULT 'not_required'");
addColumnIfMissing('students', 'balance_payment_amount', "balance_payment_amount REAL DEFAULT 0");
addColumnIfMissing('students', 'balance_payment_reference', "balance_payment_reference TEXT DEFAULT ''");
addColumnIfMissing('grades', 'final_exam_score', 'final_exam_score REAL');

addColumnIfMissing('courses', 'credits', "credits INTEGER DEFAULT 3");
addColumnIfMissing('courses', 'semester', "semester TEXT DEFAULT 'Fall'");
addColumnIfMissing('courses', 'prerequisite', "prerequisite TEXT DEFAULT ''");

const duplicateCourses = db.prepare(`
  SELECT code, MIN(id) AS keep_id, GROUP_CONCAT(id) AS duplicate_ids
  FROM courses
  GROUP BY code
  HAVING COUNT(*) > 1
`).all();
if (duplicateCourses.length) {
  db.transaction(() => {
    duplicateCourses.forEach(course => {
      const duplicateIds = course.duplicate_ids.split(',').filter(id => Number(id) !== course.keep_id);
      duplicateIds.forEach(duplicateId => {
        db.prepare('UPDATE enrollments SET course_id = ? WHERE course_id = ?').run(course.keep_id, duplicateId);
        db.prepare('UPDATE grades SET course_id = ? WHERE course_id = ?').run(course.keep_id, duplicateId);
        db.prepare('UPDATE continuous_assessments SET course_id = ? WHERE course_id = ?').run(course.keep_id, duplicateId);
        db.prepare('DELETE FROM courses WHERE id = ?').run(duplicateId);
      });
    });
  })();
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS courses_code_unique ON courses(code)');

const duplicateEnrollments = db.prepare(`
  SELECT student_id, course_id, semester, MIN(id) AS keep_id, GROUP_CONCAT(id) AS duplicate_ids
  FROM enrollments
  GROUP BY student_id, course_id, semester
  HAVING COUNT(*) > 1
`).all();
if (duplicateEnrollments.length) {
  db.transaction(() => {
    duplicateEnrollments.forEach(enrollment => {
      enrollment.duplicate_ids.split(',')
        .filter(id => Number(id) !== enrollment.keep_id)
        .forEach(id => db.prepare('DELETE FROM enrollments WHERE id = ?').run(id));
    });
  })();
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS enrollments_student_course_semester_unique ON enrollments(student_id, course_id, semester)');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS exam_registrations_student_course_semester_unique ON exam_registrations(student_id, course_id, semester)');

const insertUser = db.prepare(`
  INSERT INTO users (username, password_hash, role, full_name, email)
  VALUES (?, ?, ?, ?, ?)
`);
const insertApplicant = db.prepare(`
  INSERT INTO applicants (user_id, program_choice, intake, study_mode, nationality, national_id, student_number, status, application_fee_paid, application_receipt_file, application_receipt_status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertStudent = db.prepare(`
  INSERT INTO students (user_id, student_code, student_number, program, year_of_study, study_mode, phone, address, gpa, tuition_balance, status, portal_access, tuition_receipt_file, tuition_receipt_status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

const semesterCourseTemplates = {
  'Semester 1': [
    ['SEM1-CS101', 'Introduction to Computer Science', 3],
    ['SEM1-MATH101', 'Calculus I', 4],
    ['SEM1-ENG101', 'Communication Skills', 3],
    ['SEM1-PHY101', 'Physics I', 4],
    ['SEM1-CHEM101', 'General Chemistry', 3],
    ['SEM1-ICT101', 'Digital Literacy', 3]
  ],
  'Semester 2': [
    ['SEM2-CS201', 'Data Structures and Algorithms', 3],
    ['SEM2-MATH201', 'Discrete Mathematics', 3],
    ['SEM2-ENG201', 'Academic Writing', 3],
    ['SEM2-ECON201', 'Introduction to Economics', 3],
    ['SEM2-ICT201', 'Information and Communication Technology', 3],
    ['SEM2-BUS201', 'Fundamentals of Business', 3]
  ],
  'Semester 3': [
    ['SEM3-CS301', 'Database Systems', 3],
    ['SEM3-CS302', 'Computer Architecture', 3],
    ['SEM3-MATH301', 'Statistics for Computing', 3],
    ['SEM3-ELE201', 'Circuit Theory', 3],
    ['SEM3-STAT301', 'Probability and Statistics', 3],
    ['SEM3-LOG301', 'Logic Design', 3]
  ],
  'Semester 4': [
    ['SEM4-CS401', 'Operating Systems', 3],
    ['SEM4-CS402', 'Object-Oriented Programming', 3],
    ['SEM4-MATH401', 'Linear Algebra', 3],
    ['SEM4-NET401', 'Computer Networks', 3],
    ['SEM4-WEB401', 'Web Technologies', 3],
    ['SEM4-SYS401', 'Systems Programming', 3]
  ],
  'Semester 5': [
    ['SEM5-CS501', 'Software Engineering', 3],
    ['SEM5-CS502', 'Analysis of Algorithms', 3],
    ['SEM5-CS503', 'Human-Computer Interaction', 3],
    ['SEM5-DB501', 'Data Mining Fundamentals', 3],
    ['SEM5-SEC501', 'Information Security Foundations', 3],
    ['SEM5-ML501', 'Machine Learning Basics', 3]
  ],
  'Semester 6': [
    ['SEM6-CS601', 'Artificial Intelligence', 3],
    ['SEM6-CS602', 'Compiler Design', 3],
    ['SEM6-CS603', 'Distributed Systems', 3],
    ['SEM6-MGT601', 'Project Management', 3],
    ['SEM6-SYS601', 'Systems Analysis', 3],
    ['SEM6-DEV601', 'Mobile Application Development', 3]
  ],
  'Semester 7': [
    ['SEM7-CS701', 'Advanced Database Systems', 3],
    ['SEM7-CS702', 'Machine Learning', 3],
    ['SEM7-CS703', 'Final Year Project I', 4],
    ['SEM7-ETH701', 'Professional Ethics', 3],
    ['SEM7-ML701', 'Research Methods', 3],
    ['SEM7-CYB701', 'Cybersecurity Law', 3]
  ],
  'Semester 8': [
    ['SEM8-CS801', 'Final Year Project II', 4],
    ['SEM8-CS802', 'Cloud Computing', 3],
    ['SEM8-CS803', 'Cybersecurity', 3],
    ['SEM8-INT801', 'Industrial Attachment', 4],
    ['SEM8-AI801', 'Emerging Technologies', 3],
    ['SEM8-DEV801', 'Enterprise Systems', 3]
  ]
};

function ensureSemesterCourses() {
  Object.entries(semesterCourseTemplates).forEach(([semester, courses]) => {
    const existing = db.prepare('SELECT COUNT(*) AS total FROM courses WHERE semester = ?').get(semester).total;
    if (existing >= 5) return;

    courses.forEach(([code, name, credits]) => {
      insertCourse.run(code, name, credits, semester, '');
    });
  });
}

Object.entries(semesterCourseTemplates).forEach(([semester, courses]) => {
  courses.forEach(([code, name, credits]) => {
    insertCourse.run(code, name, credits, semester, '');
  });
});
ensureSemesterCourses();

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
const insertMaterial = db.prepare(`
  INSERT OR IGNORE INTO materials (title, description, file_name, file_type, uploaded_by, uploaded_by_name, category) VALUES (?, ?, ?, ?, ?, ?, ?)
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
const janeId = ensureUser('jane_student', 'student', 'John Phiri', 'jane@university.edu');
db.prepare('UPDATE users SET full_name = ? WHERE username = ?').run('John Phiri', 'jane_student');
const bobId = ensureUser('bob_accountant', 'accountant', 'Bob Wilson', 'bob@university.edu');
const aliceId = ensureUser('alice_admin', 'admin', 'Alice Johnson', 'alice@university.edu');
const mayaId = ensureUser('maya_applicant', 'applicant', 'Maya Chen', 'maya@university.edu');
const lecturerId = ensureUser('dr_owens', 'lecturer', 'Dr. Daniel Owens', 'lecturer@university.edu');
const examinationId = ensureUser('exam_officer', 'examination', 'Examination Officer', 'examinations@university.edu');

const existingApplicant = db.prepare('SELECT id FROM applicants WHERE user_id = ?').get(mayaId);
if (!existingApplicant) {
  insertApplicant.run(mayaId, 'Bachelor of Computer Engineering', 'January', 'Full-time', 'Kenyan', '12345678', 'STU-20260704-12345678', 'under review', 1, 'app-receipt.pdf', 'approved', 'Official transcript attached');
}

const existingStudentJohn = db.prepare('SELECT id FROM students WHERE user_id = ?').get(johnId);
if (!existingStudentJohn) {
  insertStudent.run(johnId, 'STU1001', 'STU-20260704-1001', 'Bachelor of Computer Engineering', 2, 'Full-time', '+1 555-0101', '12 Elm Street', 3.7, 250, 'active', 'blocked', '', 'pending');
}

const existingStudentJane = db.prepare('SELECT id FROM students WHERE user_id = ?').get(janeId);
if (!existingStudentJane) {
  insertStudent.run(janeId, 'STU1002', 'STU-20260704-1002', 'Bachelor of Business Administration', 1, 'Part-time', '+1 555-0102', '14 Oak Avenue', 3.2, 0, 'active', 'granted', 'tuition-receipt.pdf', 'approved');
}

const existingAdmin = db.prepare('SELECT id FROM admins WHERE user_id = ?').get(aliceId);
if (!existingAdmin) {
  insertAdmin.run(aliceId, 'Admissions', 'Director');
}

const existingAccountant = db.prepare('SELECT id FROM accountants WHERE user_id = ?').get(bobId);
if (!existingAccountant) {
  insertAccountant.run(bobId, 'Finance', 'Manager');
}

insertCourse.run('CS101', 'Introduction to Computer Science', 3, 'Semester 1', '');
insertCourse.run('MATH101', 'Calculus I', 4, 'Semester 1', '');
insertCourse.run('ENG101', 'Communication Skills', 3, 'Semester 1', '');
insertCourse.run('PHY101', 'Physics I', 4, 'Semester 1', '');

insertCourse.run('CS201', 'Data Structures and Algorithms', 3, 'Semester 2', 'CS101');
insertCourse.run('MATH201', 'Discrete Mathematics', 3, 'Semester 2', 'MATH101');
insertCourse.run('ENG201', 'Academic Writing', 3, 'Semester 2', 'ENG101');
insertCourse.run('ECON201', 'Introduction to Economics', 3, 'Semester 2', '');

insertCourse.run('CS301', 'Database Systems', 3, 'Semester 3', 'CS101');
insertCourse.run('CS302', 'Computer Architecture', 3, 'Semester 3', 'CS201');
insertCourse.run('MATH301', 'Statistics for Computing', 3, 'Semester 3', 'MATH201');
insertCourse.run('ELE201', 'Circuit Theory', 3, 'Semester 3', 'PHY101');

insertCourse.run('CS401', 'Operating Systems', 3, 'Semester 4', 'CS302');
insertCourse.run('CS402', 'Object-Oriented Programming', 3, 'Semester 4', 'CS201');
insertCourse.run('MATH401', 'Linear Algebra', 3, 'Semester 4', 'MATH301');
insertCourse.run('NET401', 'Computer Networks', 3, 'Semester 4', 'CS302');

insertCourse.run('CS501', 'Software Engineering', 3, 'Semester 5', 'CS402');
insertCourse.run('CS502', 'Analysis of Algorithms', 3, 'Semester 5', 'CS201');
insertCourse.run('CS503', 'Human-Computer Interaction', 3, 'Semester 5', 'CS401');
insertCourse.run('DB501', 'Data Mining Fundamentals', 3, 'Semester 5', 'CS301');

insertCourse.run('CS601', 'Artificial Intelligence', 3, 'Semester 6', 'CS501');
insertCourse.run('CS602', 'Compiler Design', 3, 'Semester 6', 'CS402');
insertCourse.run('CS603', 'Distributed Systems', 3, 'Semester 6', 'NET401');
insertCourse.run('MGT601', 'Project Management', 3, 'Semester 6', '');

insertCourse.run('CS701', 'Advanced Database Systems', 3, 'Semester 7', 'CS301');
insertCourse.run('CS702', 'Machine Learning', 3, 'Semester 7', 'CS601');
insertCourse.run('CS703', 'Final Year Project I', 4, 'Semester 7', 'CS501');
insertCourse.run('ETH701', 'Professional Ethics', 3, 'Semester 7', '');

insertCourse.run('CS801', 'Final Year Project II', 4, 'Semester 8', 'CS703');
insertCourse.run('CS802', 'Cloud Computing', 3, 'Semester 8', 'CS603');
insertCourse.run('CS803', 'Cybersecurity', 3, 'Semester 8', 'NET401');
insertCourse.run('INT801', 'Industrial Attachment', 4, 'Semester 8', 'CS703');

const johnStudentId = db.prepare('SELECT id FROM students WHERE user_id = ?').get(johnId).id;
const janeStudentId = db.prepare('SELECT id FROM students WHERE user_id = ?').get(janeId).id;
insertEnrollment.run(johnStudentId, 1, 'Fall', 'approved');
insertEnrollment.run(johnStudentId, 2, 'Fall', 'approved');
insertEnrollment.run(johnStudentId, 4, 'Fall', 'approved');
insertEnrollment.run(janeStudentId, 1, 'Fall', 'pending');
insertGrade.run(johnStudentId, 1, 'A+', 4.0, 'Fall');
insertGrade.run(johnStudentId, 2, 'B+', 3.3, 'Fall');
insertGrade.run(johnStudentId, 4, 'D+', 2.0, 'Fall');
insertPayment.run(johnStudentId, 1500, '2026-06-01', 'completed', 'Tuition');
insertPayment.run(janeStudentId, 250, '2026-06-15', 'pending', 'Registration Fee');
insertAnnouncement.run('Welcome to the New SIS Portal', 'Please review your application status and stay up to date with deadlines.');
insertAnnouncement.run('Campus Update', 'The university will open the student services portal for new intake on July 10.');
insertMaterial.run('Computer Science Essentials', 'Core revision notes for first-year programming and systems classes.', 'computer-science-essentials.pdf', 'application/pdf', aliceId, 'Alice Johnson', 'Core Course');
insertMaterial.run('Business Administration Handbook', 'A practical reference guide for business strategy and operations.', 'business-administration-handbook.pdf', 'application/pdf', aliceId, 'Alice Johnson', 'Program Guide');
insertMaterial.run('Research Methods Workbook', 'Download this workbook to prepare for your research modules and assignments.', 'research-methods-workbook.pdf', 'application/pdf', bobId, 'Bob Wilson', 'Academic Support');
insertNotification.run(johnId, 'Welcome', 'Your student portal access is pending tuition approval.', 'email');
insertNotification.run(johnId, 'Welcome SMS', 'Your student portal access is pending tuition approval.', 'sms');

console.log('Database setup complete! Sample data seeded.');
module.exports = db;