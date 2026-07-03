const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

// Create and open the database file
const db = new Database(path.join(__dirname, 'portal.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create the three tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'accountant', 'admin')),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    tuition_paid INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT DEFAULT 'N/A',
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
`);
// Prepare reusable insert statements
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, role, full_name, email, tuition_paid)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertCourse = db.prepare(`
  INSERT OR IGNORE INTO courses (code, name) VALUES (?, ?)
`);

const insertEnrollment = db.prepare(`
  INSERT OR IGNORE INTO enrollments (user_id, course_id, grade) VALUES (?, ?, ?)
`);

// Hash the shared demo password
const passwordHash = bcrypt.hashSync('password123', 10);

// Seed 4 users: 2 students, 1 accountant, 1 admin
insertUser.run('john_student', passwordHash, 'student', 'John Smith', 'john@university.edu', 1);
insertUser.run('jane_student', passwordHash, 'student', 'Jane Doe', 'jane@university.edu', 0);
insertUser.run('bob_accountant', passwordHash, 'accountant', 'Bob Wilson', 'bob@university.edu', 1);
insertUser.run('alice_admin', passwordHash, 'admin', 'Alice Johnson', 'alice@university.edu', 1);

// Seed 4 courses
insertCourse.run('CS101', 'Introduction to Computer Science');
insertCourse.run('CS201', 'Data Structures and Algorithms');
insertCourse.run('CS301', 'Database Systems');
insertCourse.run('MATH101', 'Calculus I');

// Seed enrollments linking students to courses with grades
insertEnrollment.run(1, 1, 'A');
insertEnrollment.run(1, 2, 'B+');
insertEnrollment.run(1, 4, 'A-');
insertEnrollment.run(2, 1, 'B');
insertEnrollment.run(2, 3, 'N/A');

console.log('Database setup complete! Sample data seeded.');
db.close();