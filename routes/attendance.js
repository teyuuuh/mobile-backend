import { Router } from 'express';
const router = Router();
import Attendance from '../models/Attendance.js';

// Get all attendance records
router.get('/', async (req, res) => {
  try {
    const data = await Attendance.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if user is currently checked in
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
        console.error('Error checking attendance status:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking attendance status'
        });
    }
});

// Handle check-in/check-out
router.post('/scan', async (req, res) => {
    try {
        const { studentID, firstName, lastName, course, yearLevel, purpose, email } = req.body;
        const today = new Date().toLocaleDateString();
        const now = new Date();

        // Check if user is currently checked in
        const currentCheckIn = await Attendance.findOne({
            studentID,
            scanDate: today,
            status: 'checked-in'
        }).sort({ checkInTime: -1 });

        if (currentCheckIn) {
            // User is checking out
            const checkOutTime = now;
            const duration = Math.round((checkOutTime - currentCheckIn.checkInTime) / (1000 * 60)); // in minutes

            currentCheckIn.checkOutTime = checkOutTime;
            currentCheckIn.status = 'checked-out';
            currentCheckIn.duration = duration;
            await currentCheckIn.save();

            res.json({
                success: true,
                action: 'checkout',
                message: 'Successfully checked out',
                attendance: currentCheckIn,
                duration: duration
            });
        } else {
            // User is checking in
            const newAttendance = new Attendance({
                studentID,
                firstName,
                lastName,
                course,
                yearLevel,
                email,
                purpose,
                checkInTime: now,
                scanDate: today,
                status: 'checked-in'
            });

            await newAttendance.save();

            res.json({
                success: true,
                action: 'checkin',
                message: 'Successfully checked in',
                attendance: newAttendance
            });
        }
    } catch (error) {
        console.error('Error processing attendance:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing attendance'
        });
    }
});

// New check-in endpoint
router.post('/checkin', async (req, res) => {
    try {
        const { userId } = req.body;
        const attendance = new Attendance({
            user: userId,
            checkIn: new Date(),
            checkOut: null
        });
        await attendance.save();
        res.status(201).json({ success: true, attendance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Checkout endpoint
router.post('/checkout', async (req, res) => {
    try {
        const { userId } = req.body;
        const attendance = await Attendance.findOne({
            user: userId,
            checkOut: null
        }).sort({ checkIn: -1 });

        if (!attendance) {
            return res.status(404).json({ success: false, error: 'No active check-in found.' });
        }

        attendance.checkOut = new Date();
        await attendance.save();
        res.json({ success: true, attendance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get today's attendance
router.get('/today', async (req, res) => {
    try {
        const today = new Date().toLocaleDateString();
        const attendanceRecords = await Attendance.find({
            scanDate: today
        }).sort({ checkInTime: -1 });

        res.json({
            success: true,
            records: attendanceRecords,
            totalCheckedIn: attendanceRecords.filter(r => r.status === 'checked-in').length,
            totalCheckedOut: attendanceRecords.filter(r => r.status === 'checked-out').length,
            totalAutoCheckout: attendanceRecords.filter(r => r.status === 'auto-checkout').length
        });
    } catch (error) {
        console.error('Error fetching today\'s attendance:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance records'
        });
    }
});

// Manual auto-checkout endpoint (for testing)
router.post('/auto-checkout', async (req, res) => {
    try {
        const result = await performAutoCheckout();
        res.json({
            success: true,
            message: 'Auto-checkout completed',
            ...result
        });
    } catch (error) {
        console.error('Error performing auto-checkout:', error);
        res.status(500).json({
            success: false,
            message: 'Error performing auto-checkout'
        });
    }
});

// Auto-checkout function
async function performAutoCheckout() {
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayDate = yesterday.toLocaleDateString();

        const uncheckedOutUsers = await Attendance.find({
            scanDate: yesterdayDate,
            status: 'checked-in'
        });

        let autoCheckedOutCount = 0;

        for (const attendance of uncheckedOutUsers) {
            const autoCheckoutTime = new Date(attendance.checkInTime);
            autoCheckoutTime.setHours(23, 59, 59, 999);

            const duration = Math.round((autoCheckoutTime - attendance.checkInTime) / (1000 * 60));

            attendance.checkOutTime = autoCheckoutTime;
            attendance.status = 'auto-checkout';
            attendance.duration = duration;
            attendance.autoCheckoutNote = 'Automatically checked out - User did not check out before midnight';

            await attendance.save();
            autoCheckedOutCount++;
        }

        console.log(`Auto-checkout completed: ${autoCheckedOutCount} users auto-checked out for ${yesterdayDate}`);

        return {
            autoCheckedOutCount,
            date: yesterdayDate
        };
    } catch (error) {
        console.error('Error in auto-checkout:', error);
        throw error;
    }
}

// Get all attendance records for a student
router.get('/student/:studentID', async (req, res) => {
    try {
        const { studentID } = req.params;
        
        // Get all records for this student, sorted by checkInTime
        const records = await Attendance.find({ studentID }).sort({ checkInTime: -1 });

        // Transform records for frontend
        const transformedRecords = records.map(record => ({
            studentID: record.studentID,
            firstName: record.firstName,
            lastName: record.lastName,
            purpose: record.purpose,
            checkInTime: record.checkInTime,
            checkOutTime: record.checkOutTime,
            scanTime: record.checkInTime, // For backward compatibility
            scanDate: record.scanDate,
            status: record.status,
            duration: record.duration
        }));

        res.json({
            success: true,
            records: transformedRecords
        });
    } catch (error) {
        console.error('Error fetching student attendance:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance records',
            error: error.message
        });
    }
});

export default router;
export { performAutoCheckout };