import express from 'express';
import Feedback from '../models/Feedback.js';

const router = express.Router();

// Submit feedback
router.post('/', async (req, res) => {
  try {
    const feedback = new Feedback({
      ...req.body,
      date: new Date()
    });

    await feedback.save();
    res.status(201).json({ 
      success: true,
      message: 'Thank you for your submission!',
      data: feedback
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      message: 'Submission failed',
      error: error.message 
    });
  }
});

export default router;