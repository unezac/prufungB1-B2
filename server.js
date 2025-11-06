const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
const db = new Database('telc_exam.db');
require('./database/init')(db);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'telc-exam-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 15 * 60 * 1000, // 15 minutes
    httpOnly: true
  }
}));

// Track user activity
app.use((req, res, next) => {
  if (req.session.userId) {
    req.session.lastActivity = Date.now();
  }
  next();
});

// Static files
app.use('/quiz', express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname)));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// Routes
const authRoutes = require('./routes/auth')(db);
const adminRoutes = require('./routes/admin')(db);
const quizRoutes = require('./routes/quiz')(db);

app.use('/api/auth', authRoutes);
app.use('/api/admin', requireAdmin, adminRoutes);
app.use('/api/quiz', requireAuth, quizRoutes);

// Ping endpoint for session management
app.get('/ping', (req, res) => {
  if (req.session.userId) {
    req.session.lastActivity = Date.now();
    res.json({ status: 'ok' });
  } else {
    res.status(401).json({ status: 'unauthorized' });
  }
});

// Logout endpoint
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Redirect routes
app.get('/home', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index2', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'index2.html'));
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});

// Admin panel route
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// Root redirect
app.get('/', (req, res) => {
  if (req.session.userId) {
    if (req.session.role === 'admin') {
      res.redirect('/admin');
    } else {
      res.redirect('/home');
    }
  } else {
    res.redirect('/login.html');
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
