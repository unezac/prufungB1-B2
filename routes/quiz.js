const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  // Get all active quizzes
  router.get('/', (req, res) => {
    try {
      const quizzes = db.prepare(`
        SELECT id, title, type, level, category, description
        FROM quizzes
        WHERE is_active = 1
        ORDER BY title
      `).all();
      res.json(quizzes);
    } catch (error) {
      console.error('Get quizzes error:', error);
      res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
  });

  // Get quiz by ID
  router.get('/:id', (req, res) => {
    try {
      const quiz = db.prepare(`
        SELECT * FROM quizzes WHERE id = ? AND is_active = 1
      `).get(req.params.id);

      if (!quiz) {
        return res.status(404).json({ error: 'Quiz not found' });
      }

      res.json(quiz);
    } catch (error) {
      console.error('Get quiz error:', error);
      res.status(500).json({ error: 'Failed to fetch quiz' });
    }
  });

  // Submit quiz result
  router.post('/submit', (req, res) => {
    const { quiz_id, score, total_questions, answers, time_spent } = req.body;

    if (!quiz_id || score === undefined || !total_questions) {
      return res.status(400).json({ error: 'Quiz ID, score, and total questions are required' });
    }

    try {
      const result = db.prepare(`
        INSERT INTO results (user_id, quiz_id, score, total_questions, answers, time_spent)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        req.session.userId,
        quiz_id,
        score,
        total_questions,
        JSON.stringify(answers || {}),
        time_spent || 0
      );

      res.json({ success: true, resultId: result.lastInsertRowid });
    } catch (error) {
      console.error('Submit result error:', error);
      res.status(500).json({ error: 'Failed to submit result' });
    }
  });

  // Get user's results
  router.get('/results/my', (req, res) => {
    try {
      const results = db.prepare(`
        SELECT r.*, q.title as quiz_title, q.type, q.level
        FROM results r
        JOIN quizzes q ON r.quiz_id = q.id
        WHERE r.user_id = ?
        ORDER BY r.completed_at DESC
      `).all(req.session.userId);

      res.json(results);
    } catch (error) {
      console.error('Get user results error:', error);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  });

  return router;
};
