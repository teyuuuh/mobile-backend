import { Router } from 'express';
const router = Router();
import RoomReservation from '../models/RoomReservation.js';

// POST - Create new reservation
router.post('/', async (req, res) => {
  try {
    const reservation = new RoomReservation(req.body);
    await reservation.save();
    res.status(201).json(reservation);
  } catch (error) {
    res.status(400).json({ 
      message: 'Failed to create reservation',
      error: error.message 
    });
  }
});

// GET - All reservations
router.get('/', async (req, res) => {
  try {
    const reservations = await RoomReservation.find().populate('userId', 'name email');
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET - Single reservation by ID
router.get('/:id', async (req, res) => {
  try {
    const reservation = await RoomReservation.findById(req.params.id);
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }
    res.json(reservation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT - Update reservation
router.put('/:id', async (req, res) => {
  try {
    const updatedReservation = await RoomReservation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updatedReservation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PATCH - Update reservation status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const reservation = await RoomReservation.findById(req.params.id);
    
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    // Validate status transition
    if (reservation.status.toLowerCase() === 'cancelled') {
      return res.status(400).json({ message: 'Reservation is already cancelled' });
    }

    if (reservation.status.toLowerCase() === 'completed') {
      return res.status(400).json({ message: 'Cannot modify a completed reservation' });
    }

    // Update status
    reservation.status = status.toLowerCase(); // Ensure lowercase for consistency
    await reservation.save();
    
    res.json({
      message: 'Reservation status updated successfully',
      reservation
    });
  } catch (error) {
    console.error('Error updating reservation status:', error);
    res.status(400).json({ 
      message: 'Failed to update reservation status',
      error: error.message 
    });
  }
});

// DELETE - Remove reservation
router.delete('/:id', async (req, res) => {
  try {
    await RoomReservation.findByIdAndDelete(req.params.id);
    res.json({ message: 'Reservation deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const reservations = await RoomReservation.find({ userId: req.params.userId })
      .sort({ date: 1, time: 1 });
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;