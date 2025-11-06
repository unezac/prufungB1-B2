const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = (db) => {
  const router = express.Router();

  // Dashboard statistics
  router.get('/stats', (req, res) => {
    try {
      const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "student"').get().count;
      const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "student" AND is_active = 1').get().count;
      const totalQuizzes = db.prepare('SELECT COUNT(*) as count FROM quizzes').get().count;
      const totalResults = db.prepare('SELECT COUNT(*) as count FROM results').get().count;
      
      const recentResults = db.prepare(`
        SELECT r.*, u.username, u.full_name, q.title as quiz_title
        FROM results r
        JOIN users u ON r.user_id = u.id
        JOIN quizzes q ON r.quiz_id = q.id
        ORDER BY r.completed_at DESC
        LIMIT 10
      `).all();

      const topScores = db.prepare(`
        SELECT u.username, u.full_name, AVG(r.score * 100.0 / r.total_questions) as avg_score, COUNT(r.id) as quiz_count
        FROM results r
        JOIN users u ON r.user_id = u.id
        GROUP BY u.id
        ORDER BY avg_score DESC
        LIMIT 10
      `).all();

      res.json({
        totalUsers,
        activeUsers,
        totalQuizzes,
        totalResults,
        recentResults,
        topScores
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  // User management
  router.get('/users', (req, res) => {
    try {
      const users = db.prepare(`
        SELECT id, username, email, role, full_name, created_at, last_login, is_active
        FROM users
        ORDER BY created_at DESC
      `).all();
      res.json(users);
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  router.get('/users/:id', (req, res) => {
    try {
      const user = db.prepare(`
        SELECT id, username, email, role, full_name, created_at, last_login, is_active
        FROM users WHERE id = ?
      `).get(req.params.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const results = db.prepare(`
        SELECT r.*, q.title as quiz_title, q.type, q.level
        FROM results r
        JOIN quizzes q ON r.quiz_id = q.id
        WHERE r.user_id = ?
        ORDER BY r.completed_at DESC
      `).all(req.params.id);

      res.json({ ...user, results });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  router.post('/users', (req, res) => {
    const { username, password, email, role, full_name } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      const hashedPassword = bcrypt.hashSync(password, 10);
      const result = db.prepare(`
        INSERT INTO users (username, password, email, role, full_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(username, hashedPassword, email || null, role || 'student', full_name || null);

      res.json({ success: true, userId: result.lastInsertRowid });
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'Username or email already exists' });
      } else {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
      }
    }
  });

  router.put('/users/:id', (req, res) => {
    const { email, role, full_name, is_active } = req.body;

    try {
      db.prepare(`
        UPDATE users
        SET email = ?, role = ?, full_name = ?, is_active = ?
        WHERE id = ?
      `).run(email || null, role || 'student', full_name || null, is_active !== undefined ? is_active : 1, req.params.id);

      res.json({ success: true });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  router.delete('/users/:id', (req, res) => {
    try {
      // Don't allow deleting yourself
      if (parseInt(req.params.id) === req.session.userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  router.post('/users/:id/reset-password', (req, res) => {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Quiz management
  router.get('/quizzes', (req, res) => {
    try {
      const quizzes = db.prepare(`
        SELECT id, title, type, level, category, description, created_at, updated_at, is_active
        FROM quizzes
        ORDER BY created_at DESC
      `).all();
      res.json(quizzes);
    } catch (error) {
      console.error('Get quizzes error:', error);
      res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
  });

  router.get('/quizzes/:id', (req, res) => {
    try {
      const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
      if (!quiz) {
        return res.status(404).json({ error: 'Quiz not found' });
      }
      res.json(quiz);
    } catch (error) {
      console.error('Get quiz error:', error);
      res.status(500).json({ error: 'Failed to fetch quiz' });
    }
  });

  router.post('/quizzes', (req, res) => {
    const { title, type, level, category, description, content, correct_answers } = req.body;

    if (!title || !type || !level) {
      return res.status(400).json({ error: 'Title, type, and level are required' });
    }

    try {
      const result = db.prepare(`
        INSERT INTO quizzes (title, type, level, category, description, content, correct_answers)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(title, type, level, category || null, description || null, content || null, correct_answers || null);

      res.json({ success: true, quizId: result.lastInsertRowid });
    } catch (error) {
      console.error('Create quiz error:', error);
      res.status(500).json({ error: 'Failed to create quiz' });
    }
  });

  router.put('/quizzes/:id', (req, res) => {
    const { title, type, level, category, description, content, correct_answers, is_active } = req.body;

    try {
      db.prepare(`
        UPDATE quizzes
        SET title = ?, type = ?, level = ?, category = ?, description = ?, 
            content = ?, correct_answers = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        title, type, level, category || null, description || null,
        content || null, correct_answers || null, is_active !== undefined ? is_active : 1,
        req.params.id
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Update quiz error:', error);
      res.status(500).json({ error: 'Failed to update quiz' });
    }
  });

  router.delete('/quizzes/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete quiz error:', error);
      res.status(500).json({ error: 'Failed to delete quiz' });
    }
  });

  // Results management
  router.get('/results', (req, res) => {
    try {
      const results = db.prepare(`
        SELECT r.*, u.username, u.full_name, q.title as quiz_title, q.type, q.level
        FROM results r
        JOIN users u ON r.user_id = u.id
        JOIN quizzes q ON r.quiz_id = q.id
        ORDER BY r.completed_at DESC
      `).all();
      res.json(results);
    } catch (error) {
      console.error('Get results error:', error);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  });

  router.delete('/results/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM results WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete result error:', error);
      res.status(500).json({ error: 'Failed to delete result' });
    }
  });

  // Settings management
  router.get('/settings', (req, res) => {
    try {
      const settings = db.prepare('SELECT * FROM settings ORDER BY key').all();
      res.json(settings);
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  router.put('/settings/:key', (req, res) => {
    const { value } = req.body;

    try {
      db.prepare(`
        UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?
      `).run(value, req.params.key);

      res.json({ success: true });
    } catch (error) {
      console.error('Update setting error:', error);
      res.status(500).json({ error: 'Failed to update setting' });
    }
  });

  return router;
};
