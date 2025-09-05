import { Router } from 'express';
import BorrowRequest from '../models/BorrowRequest.js';
import authenticateToken from '../middleware/auth.js';
import User from '../models/User.js';
import LearningMaterial from '../models/LearningMaterials.js';
import ReserveRequest from '../models/ReserveRequest.js';
import mongoose from 'mongoose';
import Activity from '../models/Activity.js'; // 6. Add Activity Logging
import Notification from '../models/Notification.js'; // 5. Add Notification System

const router = Router();
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

// POST - Create borrow request (with enhanced features)
router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { materialId, returnDate, bookTitle, author, borrowDate } = req.body;
    
    if (!materialId || !returnDate || !bookTitle) {
      await session.abortTransaction();
      return res.status(400).json({ 
        error: 'Missing required fields (materialId, returnDate, bookTitle)' 
      });
    }

    // 8. Better Data Population - Get user info
    const user = await User.findById(req.user._id).session(session);
    const userName = `${user.firstName} ${user.lastName}`;

    // 1. Check material exists
    const material = await LearningMaterial.findById(materialId).session(session);
    if (!material) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Material not found' });
    }
    
    // 2. Check material availability
    if (material.availableCopies <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        error: 'All copies of this material are currently checked out',
        availableCopies: material.availableCopies,
        currentStatus: material.status
      });
    }
    
    // 3. Create borrow request with complete material data
    const newBorrow = new BorrowRequest({
      bookTitle: bookTitle || material.name,
      author: author || material.author || 'Unknown Author',
      borrowDate: borrowDate ? new Date(borrowDate) : new Date(),
      returnDate: new Date(returnDate),
      materialId,
      userId: req.user._id,
      userName,
      status: 'pending',
      imageUrl: material.imageUrl || ''
    });

    // 4. Update material status
    material.availableCopies -= 1;
    material.status = material.availableCopies <= 0 ? 'borrowed' : 'available';
    await material.save({ session });

    await newBorrow.save({ session });
    await session.commitTransaction();
    session.endSession();

    // 5. Send Notification
    await NotificationService.createNotification(
      newBorrow.userId,
      'borrow_request_created',
      'Borrow Request Submitted',
      `Your borrow request for "${newBorrow.bookTitle}" has been submitted successfully.`
    );

    // 6. Activity Logging
    await new Activity({
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      action: 'borrow_add',
      details: `Requested to borrow: ${material.name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.status(201).json({ 
      message: 'Borrow request submitted successfully',
      request: newBorrow,
      updatedMaterial: material
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Borrow request error:', error);
    res.status(500).json({ 
      error: 'Failed to submit borrow request',
      details: error.message 
    });
  }
});

// PATCH /api/borrow-requests/:id/return - Return a borrowed book
router.patch('/:id/return', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const borrowRequest = await BorrowRequest.findById(req.params.id).session(session);
    if (!borrowRequest) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Borrow request not found' });
    }

    // Check if user owns this borrow request or is admin
    const user = await User.findById(req.user._id);
    if (borrowRequest.userId.toString() !== req.user._id.toString() && user.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Unauthorized to return this book' });
    }

    const oldStatus = borrowRequest.status;

    // Update the borrow request status
    borrowRequest.status = 'returned';
    borrowRequest.actualReturnDate = new Date();
    borrowRequest.updatedAt = new Date();
    borrowRequest.daysOverdue = 0;
    borrowRequest.amountDue = 0;
    borrowRequest.paymentStatus = 'paid';

    // Increase available copies and update material status
    const material = await LearningMaterial.findById(borrowRequest.materialId).session(session);
    if (material) {
      material.availableCopies += 1;
      material.status = material.availableCopies > 0 ? 'available' : 'unavailable';
      await material.save({ session });
    }

    await borrowRequest.save({ session });
    await session.commitTransaction();
    session.endSession();

    // 5. Send Notification
    if (oldStatus !== 'returned') {
      await NotificationService.createNotification(
        borrowRequest.userId,
        'book_returned',
        'Book Returned',
        `Your borrowed learning material "${borrowRequest.bookTitle}" has been marked as returned.`
      );
    }

    // 6. Activity Logging
    await new Activity({
      userId: req.user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      action: 'book_returned',
      details: `Returned book: ${borrowRequest.bookTitle}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.json({
      message: 'Book returned successfully',
      request: borrowRequest,
      materialStatus: material ? {
        availableCopies: material.availableCopies,
        status: material.status
      } : null
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Return book error:', error);
    res.status(500).json({ error: 'Failed to return book' });
  }
});

// GET /api/borrow-requests/my-requests - Get current user's borrow requests
router.get('/my-requests', async (req, res) => {
  try {
    // 8. Enhanced Data Population
    const requests = await BorrowRequest.find({ userId: req.user._id })
      .populate('materialId', 'title author imageUrl isbn accessionNumber yearofpub typeofmat status availableCopies')
      .sort({ createdAt: -1 });

    // Calculate amount due for overdue items
    const requestsWithCalculatedAmounts = requests.map(request => {
      if (request.status === 'overdue') {
        const now = new Date();
        const returnDate = new Date(request.returnDate);
        const timeDiff = now.getTime() - returnDate.getTime();
        const daysOverdue = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
        const amountDue = daysOverdue * 10; // ₱10 per day
        
        return {
          ...request.toObject(),
          daysOverdue,
          amountDue
        };
      }
      return request;
    });

    res.status(200).json(requestsWithCalculatedAmounts);
  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({ error: 'Failed to fetch your borrow requests' });
  }
});

// 9. Add Admin Endpoints
// GET /api/borrow-requests - Get all borrow requests (admin only)
router.get('/', async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // 8. Extensive Data Population
    const requests = await BorrowRequest.find()
      .populate('userId', 'firstName lastName email phone')
      .populate('materialId', 'title author imageUrl isbn accessionNumber status availableCopies')
      .sort({ createdAt: -1 })
      .lean();

    // Calculate amount due for overdue items
    const requestsWithCalculatedAmounts = requests.map(request => {
      if (request.status === 'overdue') {
        const now = new Date();
        const returnDate = new Date(request.returnDate);
        const timeDiff = now.getTime() - returnDate.getTime();
        const daysOverdue = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
        const amountDue = daysOverdue * 10; // ₱10 per day
        
        return {
          ...request,
          daysOverdue,
          amountDue
        };
      }
      return request;
    });

    res.status(200).json(requestsWithCalculatedAmounts);
  } catch (error) {
    console.error('Get all requests error:', error);
    res.status(500).json({ error: 'Failed to fetch borrow requests' });
  }
});

// 7. Complex Status Update Handling
router.patch('/:id/status', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { status } = req.body;
    
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Admin access required' });
    }

    const validStatuses = ['pending', 'approved', 'borrowed', 'returned', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Invalid status' });
    }

    const borrowRequest = await BorrowRequest.findById(req.params.id).session(session);
    if (!borrowRequest) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Borrow request not found' });
    }

    const oldStatus = borrowRequest.status;
    borrowRequest.status = status;
    borrowRequest.updatedAt = new Date();
    
    // Handle specific status changes
    if (status === 'returned') {
      borrowRequest.daysOverdue = 0;
      borrowRequest.amountDue = 0;
      borrowRequest.paymentStatus = 'paid';
      borrowRequest.actualReturnDate = new Date();
      
      // Return the book to available pool
      const material = await LearningMaterial.findById(borrowRequest.materialId).session(session);
      if (material) {
        material.availableCopies += 1;
        material.status = material.availableCopies > 0 ? 'available' : 'unavailable';
        await material.save({ session });
      }
    } else if (status === 'cancelled') {
      // Return the book to available pool
      const material = await LearningMaterial.findById(borrowRequest.materialId).session(session);
      if (material) {
        material.availableCopies += 1;
        material.status = material.availableCopies > 0 ? 'available' : 'unavailable';
        await material.save({ session });
      }
    } else if (status === 'borrowed') {
      // When approving a borrow request
      const material = await LearningMaterial.findById(borrowRequest.materialId).session(session);
      if (material && material.availableCopies <= 0) {
        material.status = 'borrowed';
        await material.save({ session });
      }
    }
    
    await borrowRequest.save({ session });
    await session.commitTransaction();
    session.endSession();

    // 5. Send appropriate notification based on status change
    if (oldStatus !== status) {
      let notificationTitle = '';
      let notificationMessage = '';

      switch (status) {
        case 'approved':
          notificationTitle = 'Borrow Request Approved';
          notificationMessage = `Your borrow request for "${borrowRequest.bookTitle}" has been approved.`;
          break;
        case 'borrowed':
          notificationTitle = 'Book Borrowed';
          notificationMessage = `Your borrow request for "${borrowRequest.bookTitle}" is now marked as borrowed.`;
          break;
        case 'cancelled':
          notificationTitle = 'Borrow Request Cancelled';
          notificationMessage = `Your borrow request for "${borrowRequest.bookTitle}" has been cancelled.`;
          break;
      }

      if (notificationTitle) {
        await NotificationService.createNotification(
          borrowRequest.userId,
          `borrow_${status}`,
          notificationTitle,
          notificationMessage
        );
      }
    }

    // 6. Activity Logging
    await new Activity({
      userId: req.user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      action: `borrow_status_${status}`,
      details: `Changed borrow status from ${oldStatus} to ${status} for: ${borrowRequest.bookTitle}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.json({
      message: `Borrow request status updated to ${status}`,
      request: borrowRequest
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update borrow request status' });
  }
});

// 9. Admin-initiated borrow (new route)
router.post('/admin-borrow', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, materialId, userName, bookTitle, author, imageUrl, borrowDate, returnDate } = req.body;
    
    // Verify admin permissions
    const adminUser = await User.findById(req.user._id);
    if (adminUser.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Admin privileges required.' });
    }

    // Verify target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Get complete material data
    const material = await LearningMaterial.findById(materialId).session(session);
    if (!material) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Learning material not found' });
    }

    // Check availability
    if (material.availableCopies <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        error: 'This material is not available for borrowing - no copies available'
      });
    }

    // Calculate proper dates
    const actualBorrowDate = borrowDate ? new Date(borrowDate) : new Date();
    const actualReturnDate = returnDate ? new Date(returnDate) : new Date();
    actualReturnDate.setDate(actualBorrowDate.getDate() + 3); // Default 3 days

    // Create borrow request with material data as source of truth
    const newBorrow = new BorrowRequest({
      userId,
      materialId,
      userName: userName || `${targetUser.firstName} ${targetUser.lastName}`,
      bookTitle: bookTitle || material.name,
      author: material.author,
      imageUrl: imageUrl || material.imageUrl,
      borrowDate: actualBorrowDate,
      returnDate: actualReturnDate,
      status: 'borrowed',
      adminInitiated: true
    });

    // Update material availability
    material.availableCopies -= 1;
    material.status = material.availableCopies <= 0 ? 'borrowed' : 'available';
    
    await newBorrow.save({ session });
    await material.save({ session });
    await session.commitTransaction();
    session.endSession();

    // 5. Send Notification
    await NotificationService.createNotification(
      userId,
      'admin_borrow_created',
      'Book Borrowed by Admin',
      `Admin has borrowed "${newBorrow.bookTitle}" on your behalf.`
    );

    // 6. Activity Logging
    await new Activity({
      userId: req.user._id,
      firstName: adminUser.firstName,
      lastName: adminUser.lastName,
      email: adminUser.email,
      role: adminUser.role,
      action: 'admin_borrow_add',
      details: `Admin borrowed "${newBorrow.bookTitle}" for user: ${targetUser.firstName} ${targetUser.lastName}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.status(201).json({
      message: 'Borrow request created successfully',
      borrowRequest: newBorrow,
      updatedMaterial: {
        _id: material._id,
        name: material.name,
        availableCopies: material.availableCopies,
        status: material.status
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Admin borrow error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update payment status
router.patch('/:id/payment-status', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { paymentStatus } = req.body;
    
    const borrowRequest = await BorrowRequest.findById(req.params.id).session(session);
    if (!borrowRequest) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Borrow request not found' });
    }

    borrowRequest.paymentStatus = paymentStatus;
    
    // If payment is made, optionally mark as returned
    if (paymentStatus === 'paid' && borrowRequest.status !== 'returned') {
      borrowRequest.status = 'returned';
      
      // Return the book to available pool
      const material = await LearningMaterial.findById(borrowRequest.materialId).session(session);
      if (material) {
        material.availableCopies += 1;
        material.status = material.availableCopies > 0 ? 'available' : 'unavailable';
        await material.save({ session });
      }
    }
    
    await borrowRequest.save({ session });
    await session.commitTransaction();
    session.endSession();

    // 6. Activity Logging
    const user = await User.findById(req.user._id);
    await new Activity({
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      action: 'payment_status_update',
      details: `Updated payment status to ${paymentStatus} for: ${borrowRequest.bookTitle}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.json({
      message: 'Payment status updated successfully',
      borrowRequest
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Payment status update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/borrow-requests/check-overdue - Check and update overdue requests
router.get('/check-overdue', async (req, res) => {
  try {
    const now = new Date();
    const result = await BorrowRequest.updateMany(
      {
        returnDate: { $lt: now },
        status: { $in: ['pending', 'approved', 'borrowed'] }
      },
      {
        $set: {
          status: 'overdue',
          updatedAt: new Date()
        }
      }
    );

    res.status(200).json({
      message: 'Overdue check completed',
      updated: result.modifiedCount
    });
  } catch (error) {
    console.error('Check overdue error:', error);
    res.status(500).json({ error: 'Failed to check overdue requests' });
  }
});

// GET /api/borrow-requests/:id/rating-status - Check if user has rated this borrow
router.get('/:id/rating-status', async (req, res) => {
  try {
    const borrowId = req.params.id;
    const userId = req.user._id;

    const BookRating = require('../models/BookRating.js');
    const hasRated = await BookRating.findOne({
      borrowId: borrowId,
      userId: userId
    });

    res.json({ hasUserRated: !!hasRated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;