const bcrypt = require('bcryptjs');

module.exports = (db) => {
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'student',
      full_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Create quizzes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT,
      description TEXT,
      content TEXT,
      correct_answers TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Create results table
  db.exec(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quiz_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      answers TEXT,
      time_spent INTEGER,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    )
  `);

  // Create sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Check if admin user exists
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  
  if (!adminExists) {
    // Create default admin user
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, email, role, full_name)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin', hashedPassword, 'admin@telc-exam.com', 'admin', 'Administrator');
    
    console.log('Default admin user created:');
    console.log('Username: admin');
    console.log('Password: admin123');
    console.log('Please change the password after first login!');
  }

  // Insert default settings
  const settingsExist = db.prepare('SELECT id FROM settings LIMIT 1').get();
  
  if (!settingsExist) {
    const defaultSettings = [
      ['session_timeout', '900000', 'Session timeout in milliseconds (15 minutes)'],
      ['warning_before_logout', '30000', 'Warning time before logout in milliseconds (30 seconds)'],
      ['max_login_attempts', '5', 'Maximum login attempts before lockout'],
      ['site_name', 'TELC Exam Platform', 'Website name'],
      ['allow_registration', '0', 'Allow user self-registration (0=no, 1=yes)']
    ];

    const insertSetting = db.prepare('INSERT INTO settings (key, value, description) VALUES (?, ?, ?)');
    
    for (const [key, value, description] of defaultSettings) {
      insertSetting.run(key, value, description);
    }
  }

  console.log('Database initialized successfully');
};
