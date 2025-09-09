import { Router } from 'express';
const router = Router();
import Attendance from '../models/Attendance.js';

// ✅ Get all attendance
router.get('/', async (req, res) => {
  try {
    const data = await Attendance.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Check if user is currently checked in
router.get('/status/:studentID', async (req, res) => {
  try {
    const { studentID } = req.params;
    const today = new Date().toLocaleDateString();

    const currentCheckIn = await Attendance.findOne({
      studentID,
      scanDate: today,
      status: 'checked-in'
    }).sort({ checkInTime: -1 });

    res.json({
      success: true,
      isCheckedIn: !!currentCheckIn,
      currentSession: currentCheckIn
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error checking attendance status' });
  }
});

// ✅ Scan (check-in / check-out)
router.post('/scan', async (req, res) => {
  try {
    const { studentID, firstName, lastName, course, yearLevel, purpose, email } = req.body;
    const today = new Date().toLocaleDateString();
    const now = new Date();

    const currentCheckIn = await Attendance.findOne({
      studentID,
      scanDate: today,
      status: 'checked-in'
    }).sort({ checkInTime: -1 });

    if (currentCheckIn) {
      currentCheckIn.checkOutTime = now;
      currentCheckIn.status = 'checked-out';
      currentCheckIn.duration = Math.round((now - currentCheckIn.checkInTime) / (1000 * 60));
      await currentCheckIn.save();

      res.json({ success: true, action: 'checkout', message: 'Successfully checked out', attendance: currentCheckIn });
    } else {
      const newAttendance = new Attendance({
        studentID, firstName, lastName, course, yearLevel, email, purpose,
        checkInTime: now,
        scanDate: today,
        status: 'checked-in'
      });

      await newAttendance.save();
      res.json({ success: true, action: 'checkin', message: 'Successfully checked in', attendance: newAttendance });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error processing attendance' });
  }
});

// ✅ Checkout
router.post('/checkout', async (req, res) => {
  try {
    const { userId } = req.body;
    const attendance = await Attendance.findOne({ user: userId, checkOut: null }).sort({ checkIn: -1 });

    if (!attendance) return res.status(404).json({ success: false, error: 'No active check-in found.' });

    attendance.checkOut = new Date();
    await attendance.save();
    res.json({ success: true, attendance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Get today's attendance
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString();
    const attendanceRecords = await Attendance.find({ scanDate: today }).sort({ checkInTime: -1 });

    res.json({
      success: true,
      records: attendanceRecords,
      totalCheckedIn: attendanceRecords.filter(r => r.status === 'checked-in').length,
      totalCheckedOut: attendanceRecords.filter(r => r.status === 'checked-out').length,
      totalAutoCheckout: attendanceRecords.filter(r => r.status === 'auto-checkout').length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching attendance records' });
  }
});

// ✅ Get all records for a student
router.get('/student/:studentID', async (req, res) => {
  try {
    const { studentID } = req.params;
    const records = await Attendance.find({ studentID }).sort({ checkInTime: -1 });

    const grouped = {};
    records.forEach(rec => {
      const dateKey = rec.scanDate;
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: dateKey,
          checkIn: rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : null,
          checkOut: rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : null,
          purpose: rec.purpose || '',
          rawDate: rec.checkInTime ? new Date(rec.checkInTime).toISOString() : null,
          status: rec.status,
          duration: rec.duration,
        };
      } else if (rec.checkOutTime && (!grouped[dateKey].checkOut || rec.checkOutTime > grouped[dateKey].checkOut)) {
        grouped[dateKey].checkOut = new Date(rec.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    });

    const result = Object.values(grouped).sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

    res.json({ success: true, records: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching attendance records' });
  }
});

export default router;
