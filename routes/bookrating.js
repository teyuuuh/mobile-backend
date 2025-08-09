import express from 'express';
import BookRating from '../models/BookRating.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();

// Submit a book rating (identical structure to your Feedback example)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { bookId, transactionId, rating, review, materialTitle, author } = req.body;
    const userId = req.user._id;

    // Basic validation
    if (!bookId || !transactionId || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Book ID, Transaction ID, and Rating are required'
      });
    }

    // Create rating (same pattern as your Feedback route)
    const newRating = new BookRating({
      userId,
      bookId,
      transactionId,
      rating,
      review: review || '',
      materialTitle,
      author,
      createdAt: new Date()
    });

    await newRating.save();

    res.status(201).json({ 
      success: true,
      message: 'Book rating submitted successfully!',
      data: newRating
    });

  } catch (error) {
    // Handle duplicate ratings
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this transaction'
      });
    }
    
    res.status(400).json({ 
      success: false,
      message: 'Rating submission failed',
      error: error.message 
    });
  }
});

// Get all ratings for a book
router.get('/book/:bookId', async (req, res) => {
  try {
    const ratings = await BookRating.find({ bookId })
      .populate('userId', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({ 
      success: true,
      data: ratings
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch ratings',
      error: error.message 
    });
  }
});

export default router;