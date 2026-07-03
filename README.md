# University Student Portal

A Node.js web application demonstrating Role-Based Access Control (RBAC) with three user roles: Student, Accountant, and Admin.

## Features

- Session-based authentication with password hashing
- Role-Based Access Control (Student, Accountant, Admin)
- Student dashboard with course enrollment and grades
- Admin panel for managing student details
- Accountant view for tuition payment status
- Password reset functionality

## Tech Stack

- Node.js with Express.js
- EJS templating
- SQLite (better-sqlite3)
- bcryptjs for password hashing
- express-session for session management

## Setup

1. Clone the repository
2. Run `npm install`
3. Run `npm run setup-db` to create and seed the database
4. Run `npm start` to start the server
5. Visit `http://localhost:3000`

## Demo Accounts

| Username | Password | Role |
|----------|----------|------|
| john_student | password123 | Student |
| jane_student | password123 | Student (John Phiri) |
| bob_accountant | password123 | Accountant |
| alice_admin | password123 | Admin |

## License

MIT