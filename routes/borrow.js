import { Router } from 'express';
import BorrowRequest from '../models/BorrowRequest.js';
import authenticateToken from '../middleware/auth.js';
import User from '../models/User.js';
import LearningMaterial from '../models/LearningMaterials.js';
import ReserveRequest from '../models/ReserveRequest.js';
import mongoose from 'mongoose';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { materialId, returnDate, bookTitle, author } = req.body;
    
    if (!materialId || !returnDate || !bookTitle) {
      await session.abortTransaction();
      return res.status(400).json({ 
        error: 'Missing required fields (materialId, returnDate, bookTitle)' 
      });
    }

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
    
    // 3. Create borrow request
    const newBorrow = new BorrowRequest({
      bookTitle,
      author: author || 'Unknown Author',
      borrowDate: req.body.borrowDate || new Date(),
      returnDate: new Date(returnDate),
      materialId,
      userId: req.user._id,
      userName: req.body.userName || `${req.user.firstName} ${req.user.lastName}`,
      status: 'pending'
    });

    // 4. Update material status
    await LearningMaterial.findByIdAndUpdate(
      materialId,
      { 
        $inc: { availableCopies: -1 },
        status: material.availableCopies - 1 <= 0 ? 'borrowed' : 'available'
      },
      { session }
    );

    await newBorrow.save({ session });
    await session.commitTransaction();

    res.status(201).json({ 
      message: 'Borrow request submitted successfully',
      request: newBorrow
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Borrow request error:', error);
    res.status(500).json({ 
      error: 'Failed to submit borrow request',
      details: error.message 
    });
  } finally {
    session.endSession();
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
    if (borrowRequest.userId.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Unauthorized to return this book' });
    }

    // Update the borrow request status
    const updatedRequest = await BorrowRequest.findByIdAndUpdate(
      req.params.id,
      {
        status: 'returned',
        actualReturnDate: new Date(),
        updatedAt: new Date()
      },
      { new: true, session }
    );

    // Increase available copies and update material status
    const updatedMaterial = await LearningMaterial.findByIdAndUpdate(
      borrowRequest.materialId,
      {
        $inc: { availableCopies: 1 },
        status: 'available'
      },
      { new: true, session }
    );

    await session.commitTransaction();

    res.json({
      message: 'Book returned successfully',
      request: updatedRequest,
      materialStatus: {
        availableCopies: updatedMaterial.availableCopies,
        status: updatedMaterial.status
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Return book error:', error);
    res.status(500).json({ error: 'Failed to return book' });
  } finally {
    session.endSession();
  }
});

// GET /api/borrow-requests/my-requests - Get current user's borrow requests
router.get('/my-requests', async (req, res) => {
  try {
    const requests = await BorrowRequest.find({ userId: req.user._id })
      .populate('materialId', 'title author imageUrl isbn accessionNumber yearofpub typeofmat status')
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({ error: 'Failed to fetch your borrow requests' });
  }
});

// GET /api/borrow-requests - Get all borrow requests (admin only)
router.get('/', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const requests = await BorrowRequest.find()
      .populate('userId', 'firstName lastName email')
      .populate('materialId', 'title author imageUrl')
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error('Get all requests error:', error);
    res.status(500).json({ error: 'Failed to fetch borrow requests' });
  }
});

// PATCH /api/borrow-requests/:id/status - Update borrow request status (admin only)
router.patch('/:id/status', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { status } = req.body;
    const validStatuses = ['pending', 'approved', 'borrowed', 'returned', 'overdue', 'cancelled'];

    if (!validStatuses.includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Invalid status' });
    }

    const request = await BorrowRequest.findByIdAndUpdate(
      req.params.id,
      {
        status,
        updatedAt: new Date(),
        ...(status === 'approved' && { approvedAt: new Date() }),
        ...(status === 'borrowed' && { borrowedAt: new Date() }),
        ...(status === 'returned' && { actualReturnDate: new Date() })
      },
      { new: true, session }
    );

    if (!request) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Borrow request not found' });
    }

    // Update material status based on new borrow request status
    let materialUpdate = {};

    if (status === 'cancelled' || status === 'returned') {
      // Return copy to available pool
      materialUpdate = {
        $inc: { availableCopies: 1 },
        status: 'available'
      };
    } else if (status === 'borrowed') {
      // Mark as borrowed if no available copies
      const material = await LearningMaterial.findById(request.materialId).session(session);
      if (material && material.availableCopies <= 0) {
        materialUpdate = { status: 'borrowed' };
      }
    }

    if (Object.keys(materialUpdate).length > 0) {
      await LearningMaterial.findByIdAndUpdate(
        request.materialId,
        materialUpdate,
        { session }
      );
    }

    await session.commitTransaction();

    res.json({
      message: `Borrow request ${status} successfully`,
      request
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update borrow request status' });
  } finally {
    session.endSession();
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

// GET /api/borrow-requests/debug - Debug endpoint (development only)
router.get('/debug', async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: 'Not found' });
    }

    const requests = await BorrowRequest.find().limit(5);
    const materials = await LearningMaterial.find().limit(5);
    const reservations = await ReserveRequest.find().limit(5);

    const brokenRefs = await BorrowRequest.aggregate([
      {
        $lookup: {
          from: 'learningmaterials',
          localField: 'materialId',
          foreignField: '_id',
          as: 'material'
        }
      },
      {
        $match: {
          'material.0': { $exists: false }
        }
      }
    ]);

    res.json({
      sampleRequests: requests,
      sampleMaterials: materials,
      sampleReservations: reservations,
      brokenReferences: brokenRefs,
      modelNames: mongoose.modelNames(),
      stats: {
        totalBorrowRequests: await BorrowRequest.countDocuments(),
        totalMaterials: await LearningMaterial.countDocuments(),
        totalReservations: await ReserveRequest.countDocuments()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;