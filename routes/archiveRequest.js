import { Router } from 'express';
const router = Router();
import ArchiveRequest from '../models/ArchivesRequest.js';
import Activity from '../models/Activity.js'; // Add activity logging
import User from '../models/User.js';
import authenticateToken from '../middleware/auth.js';
import Notification from '../models/Notification.js'; // Add notification system

// Apply authentication middleware to all routes
router.use(authenticateToken);

// 5. Add Notification Service (simplified version)
const NotificationService = {
  async createNotification(userId, type, title, message) {
    try {
      const notification = new Notification({
        userId,
        type,
        title,
        message,
        isRead: false,
        createdAt: new Date()
      });
      await notification.save();
      return notification;
    } catch (error) {
      console.error('Notification creation error:', error);
    }
  }
};

// Submit a new archive request (used by user form)
router.post('/', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { fullName, documentType, purpose, purposeOther, date, userId } = req.body;
    
    const newRequest = new ArchiveRequest({
      fullName,
      documentType,
      purpose,
      purposeOther,
      date,
      userId: userId || req.user._id
    });
    
    await newRequest.save();

    // 6. Activity Logging
    await new Activity({
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      action: 'archiverequest_add',
      details: 'User made an archive request',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    // 5. Send Notification to user
    await NotificationService.createNotification(
      user._id,
      'archive_request_submitted',
      'Archive Request Submitted',
      `Your archive request for "${documentType}" has been submitted successfully.`
    );

    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Archive request error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get all archive requests (used by admin panel)
router.get('/', async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const requests = await ArchiveRequest.find()
      .populate('userId', 'firstName lastName email phone')
      .sort({ createdAt: -1 });
    
    res.json(requests);
  } catch (error) {
    console.error('Get archive requests error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get current user's archive requests
router.get('/my-requests', async (req, res) => {
  try {
    const requests = await ArchiveRequest.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    
    res.json(requests);
  } catch (error) {
    console.error('Get my archive requests error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Approve/reject a request (admin action)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    // Check if user is admin
    const adminUser = await User.findById(req.user._id);
    if (adminUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const request = await ArchiveRequest.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    ).populate('userId', 'firstName lastName email');

    if (!request) {
      return res.status(404).json({ error: 'Archive request not found' });
    }

    // 5. CREATE NOTIFICATION BASED ON STATUS CHANGE
    try {
      if (status === 'approved') {
        await NotificationService.createNotification(
          request.userId._id,
          'archive_request_approved',
          'Archive Request Approved',
          `Your archive request for "${request.documentType}" has been approved.`
        );
      } else if (status === 'rejected') {
        await NotificationService.createNotification(
          request.userId._id,
          'archive_request_rejected',
          'Archive Request Rejected',
          `Your archive request for "${request.documentType}" has been rejected.`
        );
      }
    } catch (notificationError) {
      console.error('Failed to create notification:', notificationError);
    }

    // 6. Activity Logging
    await new Activity({
      userId: adminUser._id,
      firstName: adminUser.firstName,
      lastName: adminUser.lastName,
      email: adminUser.email,
      role: adminUser.role,
      action: `archive_request_${status}`,
      details: `Changed archive request status to ${status} for: ${request.documentType}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.json(request);
  } catch (error) {
    console.error('Error updating archive request status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a request (admin action)
router.delete('/:id', async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const request = await ArchiveRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Archive request not found' });
    }

    await ArchiveRequest.findByIdAndDelete(req.params.id);

    // 6. Activity Logging
    await new Activity({
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      action: 'archive_request_deleted',
      details: `Deleted archive request for: ${request.documentType}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Delete archive request error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get archive request statistics (admin only)
router.get('/stats', async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const totalRequests = await ArchiveRequest.countDocuments();
    const pendingRequests = await ArchiveRequest.countDocuments({ status: 'pending' });
    const approvedRequests = await ArchiveRequest.countDocuments({ status: 'approved' });
    const rejectedRequests = await ArchiveRequest.countDocuments({ status: 'rejected' });

    // Get requests by document type
    const requestsByType = await ArchiveRequest.aggregate([
      {
        $group: {
          _id: '$documentType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get requests by purpose
    const requestsByPurpose = await ArchiveRequest.aggregate([
      {
        $group: {
          _id: '$purpose',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      requestsByType,
      requestsByPurpose
    });
  } catch (error) {
    console.error('Get archive stats error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;