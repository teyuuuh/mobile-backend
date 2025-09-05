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

// POST - Create reservation (with enhanced features)
router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bookId, pickupDate, bookTitle, author, reservationDate, userId, userName } = req.body;

    if (!bookId || !pickupDate || !bookTitle) {
      await session.abortTransaction();
      return res.status(400).json({
        error: 'Missing required fields (bookId, pickupDate, bookTitle)'
      });
    }

    // 8. Better Data Population - Get user info if not provided
    let userInfo = {};
    if (!userName || !userId) {
      const user = await User.findById(req.user._id).session(session);
      userInfo = {
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`
      };
    }

    const material = await LearningMaterial.findById(bookId).session(session);
    if (!material) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Material not found' });
    }

    if (material.availableCopies <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        error: 'No available copies to reserve',
        availableCopies: material.availableCopies
      });
    }

    const newReservation = new ReserveRequest({
      bookTitle,
      author: author || material.author || 'Unknown Author',
      reservationDate: reservationDate ? new Date(reservationDate) : new Date(),
      pickupDate: new Date(pickupDate),
      bookId: bookId,
      userId: userId || userInfo.userId || req.user._id,
      userName: userName || userInfo.userName || `${req.user.firstName} ${req.user.lastName}`,
      status: 'pending'
    });

    await newReservation.save({ session });

    // 10. Enhanced Material Handling
    material.availableCopies -= 1;
    material.status = material.availableCopies <= 0 ? 'unavailable' : 'available';
    await material.save({ session });

    await session.commitTransaction();
    session.endSession();

    // 5. Send Notification
    await NotificationService.createNotification(
      newReservation.userId,
      'reservation_created',
      'Reservation Submitted',
      `Your reservation for "${newReservation.bookTitle}" has been submitted successfully.`
    );

    // 6. Activity Logging
    const user = await User.findById(newReservation.userId);
    await new Activity({
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      action: 'reserve_add',
      details: `Reserved material: ${material.name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.status(201).json({
      message: 'Reservation submitted successfully',
      request: newReservation,
      updatedMaterial: material
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Reservation error:', error);
    res.status(500).json({
      error: 'Failed to submit reservation',
      details: error.message
    });
  }
});

// 9. Add Admin Endpoints (with proper authorization check)
router.get('/admin/all-requests', async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin required.' });
    }

    // 8. Extensive Data Population
    const requests = await ReserveRequest.find()
      .populate('userId', 'firstName lastName email phone')
      .populate('bookId', 'name author imageUrl isbn accessionNumber status availableCopies')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Complex Status Update Handling
router.patch('/:id/status', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { status } = req.body;
    const { id } = req.params;

    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Access denied. Admin required.' });
    }

    const reserveRequest = await ReserveRequest.findById(id).session(session);
    if (!reserveRequest) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Reserve request not found' });
    }

    const oldStatus = reserveRequest.status;
    reserveRequest.status = status;
    reserveRequest.updatedAt = new Date();

    const material = await LearningMaterial.findById(reserveRequest.bookId).session(session);

    // 7. Complex Status Handling
    if (status === 'borrowed') {
      // Convert to borrow request
      const newBorrow = new BorrowRequest({
        userId: reserveRequest.userId,
        userName: reserveRequest.userName,
        materialId: reserveRequest.bookId,
        bookTitle: reserveRequest.bookTitle,
        author: reserveRequest.author,
        imageUrl: material?.imageUrl || '',
        borrowDate: new Date(),
        returnDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'borrowed'
      });
      
      await newBorrow.save({ session });
      
    } else if (status === 'cancelled' || status === 'rejected') {
      // Return the copy to available pool
      if (material) {
        material.availableCopies += 1;
        material.status = material.availableCopies > 0 ? 'available' : 'unavailable';
        await material.save({ session });
      }
    }

    await reserveRequest.save({ session });
    await session.commitTransaction();
    session.endSession();

    // 5. Send appropriate notification based on status change
    let notificationTitle = '';
    let notificationMessage = '';

    switch (status) {
      case 'approved':
        notificationTitle = 'Reservation Approved';
        notificationMessage = `Your reservation for "${reserveRequest.bookTitle}" has been approved.`;
        break;
      case 'borrowed':
        notificationTitle = 'Reservation Converted';
        notificationMessage = `Your reservation for "${reserveRequest.bookTitle}" has been converted to a borrow.`;
        break;
      case 'cancelled':
      case 'rejected':
        notificationTitle = 'Reservation Cancelled';
        notificationMessage = `Your reservation for "${reserveRequest.bookTitle}" has been ${status}.`;
        break;
    }

    if (notificationTitle && oldStatus !== status) {
      await NotificationService.createNotification(
        reserveRequest.userId,
        `reservation_${status}`,
        notificationTitle,
        notificationMessage
      );
    }

    // 6. Activity Logging
    await new Activity({
      userId: req.user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      action: `reserve_status_${status}`,
      details: `Changed reservation status from ${oldStatus} to ${status} for: ${reserveRequest.bookTitle}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.json({
      message: `Reservation status updated to ${status}`,
      reserveRequest
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Status update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET user reservations with better data population
router.get('/my-requests', async (req, res) => {
  try {
    // 8. Enhanced Data Population
    const requests = await ReserveRequest.find({ userId: req.user._id })
      .populate('bookId', 'title author imageUrl isbn accessionNumber yearofpub typeofmat status availableCopies')
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({ error: 'Failed to fetch your reservation requests' });
  }
});

// Cancel reservation with enhanced features
router.patch('/:id/cancel', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reservation = await ReserveRequest.findById(req.params.id).session(session);

    if (!reservation) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Reservation not found' });
    }

    // Check if user owns this reservation or is admin
    const user = await User.findById(req.user._id);
    if (reservation.userId.toString() !== req.user._id.toString() && user.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!['pending', 'approved'].includes(reservation.status)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Cannot cancel this reservation' });
    }

    const oldStatus = reservation.status;
    reservation.status = 'cancelled';
    reservation.cancelledAt = new Date();
    await reservation.save({ session });

    // 10. Enhanced Material Handling
    const material = await LearningMaterial.findById(reservation.bookId).session(session);
    if (material) {
      material.availableCopies += 1;
      material.status = material.availableCopies > 0 ? 'available' : 'unavailable';
      await material.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // 5. Send cancellation notification
    if (oldStatus !== 'cancelled') {
      await NotificationService.createNotification(
        reservation.userId,
        'reservation_cancelled',
        'Reservation Cancelled',
        `Your reservation for "${reservation.bookTitle}" has been cancelled.`
      );
    }

    // 6. Activity Logging
    await new Activity({
      userId: req.user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      action: 'reserve_cancel',
      details: `Cancelled reservation for: ${reservation.bookTitle}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }).save();

    res.json({ message: 'Reservation cancelled successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: error.message });
  }
});

export default router;