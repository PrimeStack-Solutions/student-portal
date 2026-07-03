const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');
const accountantRoutes = require('./routes/accountant');

const app = express();
const PORT = 3000;

// Tell Express to use EJS for rendering HTML pages
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Parse form submissions and serve static files
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure session middleware to remember logged-in users
app.use(session({
  secret: 'student-portal-secret-key',
  resave: false,
  saveUninitialized: false
}));

// Mount route handlers
app.use('/', authRoutes);
app.use('/student', studentRoutes);
app.use('/admin', adminRoutes);
app.use('/accountant', accountantRoutes);

// Redirect the root URL to the login page
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Student Portal running at http://localhost:${PORT}`);
});