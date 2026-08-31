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
4. Create a local HTTPS certificate in PowerShell:

   ```powershell
   New-Item -ItemType Directory -Force certs
   $certificate = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddYears(1)
   $password = ConvertTo-SecureString 'student-portal' -AsPlainText -Force
   Export-PfxCertificate -Cert $certificate -FilePath .\certs\localhost.pfx -Password $password
   ```

5. Run `npm start` to start the server
6. Visit `https://localhost:3000`

The local certificate is self-signed, so your browser may ask you to accept a security warning once.

## Demo Accounts

| Username | Password | Role |
|----------|----------|------|
| john_student | password123 | Student |
| jane_student | password123 | Student (John Phiri) |
| bob_accountant | password123 | Accountant |
| alice_admin | password123 | Admin |
| exam_officer | password123 | Examination Department |

## License

MIT