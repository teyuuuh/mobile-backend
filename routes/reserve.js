import { Router } from 'express';
import BorrowRequest from '../models/BorrowRequest.js';
import authenticateToken from '../middleware/auth.js';
import User from '../models/User.js';
import LearningMaterial from '../models/LearningMaterials.js';
import ReserveRequest from '../models/ReserveRequest.js';
import mongoose from 'mongoose';

const router = Router();

router.use(authenticateToken);

router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bookId, pickupDate, bookTitle, author, reservationDate, userId, userName } = req.body;

    if (!bookId || !pickupDate || !bookTitle) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Missing required fields (bookId, pickupDate, bookTitle)' });
    }

    const material = await LearningMaterial.findById(bookId).session(session);
    if (!material) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Material not found' });
    }

    if (material.availableCopies <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'No available copies to reserve' });
    }

    const newReservation = new ReserveRequest({
      bookTitle,
      author: author || 'Unknown Author',
      reservationDate: reservationDate ? new Date(reservationDate) : new Date(),
      pickupDate: new Date(pickupDate),
      bookId,
      userId: userId || req.user._id,
      userName: userName || `${req.user.firstName} ${req.user.lastName}`,
      status: 'pending'
    });

    await newReservation.save({ session });

    // ✅ Update material copies/status
    material.availableCopies -= 1;
    if (material.availableCopies <= 0) {
      material.status = 'unavailable';
    }
    await material.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      message: 'Reservation submitted successfully',
      request: newReservation
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Reservation error:', error);
    res.status(500).json({ error: 'Failed to submit reservation', details: error.message });
  } finally {
    session.endSession();
  }
});


router.patch('/:id/return', authenticateToken, async (req, res) => {
  try {
    const request = await BorrowRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Borrow request not found' });
    }

    // Update the borrow request status
    await BorrowRequest.findByIdAndUpdate(
      req.params.id,
      { status: 'returned' }
    );

    // Increase available copies and update status if needed
    await LearningMaterial.findByIdAndUpdate(
      request.materialId,
      {
        $inc: { availableCopies: 1 },
        status: 'available'
      }
    );

    res.json({ message: 'Book returned successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/my-requests', async (req, res) => {
  try {
    const requests = await ReserveRequest.find({ userId: req.user._id })
      .populate('bookId', 'title author imageUrl isbn accessionNumber yearofpub typeofmat status')
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({ error: 'Failed to fetch your reservation requests' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const requests = await BorrowRequest.find()
      .populate('userId', 'firstName lastName')
      .lean();

    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/debug', async (req, res) => {
  try {
    const requests = await BorrowRequest.find().limit(1);
    const sample = requests[0];
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
      rawRequest: sample,
      brokenReferences: brokenRefs,
      materialModelExists: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/check-overdue', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const result = await BorrowRequest.updateMany(
      {
        returnDate: { $lt: now },
        status: { $in: ['pending', 'borrowed'] }
      },
      {
        $set: { status: 'overdue' }
      }
    );
    res.status(200).json({ updated: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const request = await BorrowRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    // Update the corresponding material status
    await LearningMaterial.findByIdAndUpdate(
      request.materialId,
      { status }
    );

    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;