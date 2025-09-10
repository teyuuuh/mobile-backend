import express from 'express';
import authenticateToken from '../middleware/auth.js';
import User from '../models/User.js';
import cloudinary from '../config/cloudinary.js';
import { fileURLToPath } from 'url';
import path from 'path';

const router = express.Router();

// ✅ ayusin dirname para consistent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Upload profile image to Cloudinary
router.post('/:userId/upload-profile', authenticateToken, async (req, res) => {
  try {
    if (req.user._id.toString() !== req.params.userId) {
      return res.status(403).json({ error: 'Unauthorized to upload for this user' });
    }

    if (!req.files || !req.files.profileImage) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.files.profileImage;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'profile-images', // organize in folder
      public_id: `${req.params.userId}_${Date.now()}`,
      resource_type: 'image',
    });

    // Update user with Cloudinary URL
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { profileImage: result.secure_url },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Profile image uploaded successfully',
      profileImage: result.secure_url, // Cloudinary URL
      user
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ error: 'Server error while uploading profile image' });
  }
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ success: false, error: 'Current password is incorrect.' });

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});


export default router;
