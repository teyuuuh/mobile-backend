import express from 'express';
import authenticateToken from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// Get user history
router.get('/:userId/history', authenticateToken, async (req, res) => {
  try {
    // Verify the requesting user has access to this history
    if (req.user._id !== req.params.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized to access this history' 
      });
    }

    const user = await User.findById(req.params.userId)
      .populate({
        path: 'history.book',
        select: 'title author imageUrl description' // Only select needed fields
      })
      .select('history');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: user.history || []
    });
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;