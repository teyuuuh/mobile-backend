import { Router } from 'express';
const router = Router();
import ArchiveRequest from '../models/ArchivesRequest.js';

// Submit a new archive request (used by user form)
router.post('/', async (req, res) => {
  try {
    const { fullName, documentType, purpose, purposeOther, date, userId } = req.body;
    const newRequest = new ArchiveRequest({
      fullName,
      documentType,
      purpose,
      purposeOther,
      date,
      userId
    });
    await newRequest.save();
    res.status(201).json(newRequest);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all archive requests (used by admin panel)
router.get('/', async (req, res) => {
  try {
    const requests = await ArchiveRequest.find().populate('userId', 'name email');
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Approve/reject a request (admin action)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await ArchiveRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json(request);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a request (admin action)
router.delete('/:id', async (req, res) => {
  try {
    await ArchiveRequest.findByIdAndDelete(req.params.id);
    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
