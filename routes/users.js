import express from 'express';
import authenticateToken from '../middleware/auth.js';
import User from '../models/User.js';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Get user history
router.get('/:userId/history', authenticateToken, async (req, res) => {
  try {
    if (req.user._id.toString() !== req.params.userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized to access this history' 
      });
    }

    const user = await User.findById(req.params.userId)
      .populate({
        path: 'history.book',
        select: 'title author imageUrl description'
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

// 📌 Upload profile image
router.post('/:userId/upload-profile', authenticateToken, async (req, res) => {
  try {
    // Check ownership
    if (req.user._id.toString() !== req.params.userId) {
      return res.status(403).json({ error: 'Unauthorized to upload for this user' });
    }

    if (!req.files || !req.files.profileImage) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.files.profileImage;

    // Ensure it's an image
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Invalid file type. Only images allowed.' });
    }

    // Define upload path
    const uploadDir = path.join(process.cwd(), 'uploads/profile-images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `${Date.now()}_${file.name}`;
    const uploadPath = path.join(uploadDir, fileName);

    // Move file to uploads folder
    await file.mv(uploadPath);

    // Update user document with profileImage path (URL to serve)
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { profileImage: `/profile-images/${fileName}` },
      { new: true }
    );

    res.json({
      message: 'Profile image uploaded successfully',
      profileImage: user.profileImage,
      user
    });
  } catch (error) {
    console.error('Profile upload error:', error);
    res.status(500).json({ error: 'Server error while uploading profile image' });
  }
});

export default router;
