import { Schema, model } from 'mongoose';

const attendanceSchema = new Schema({
  studentID: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  course: {
    type: String,
    required: true
  },
  yearLevel: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    required: true
  },
  checkInTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkOutTime: {
    type: Date,
    default: null
  },
  scanDate: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['checked-in', 'checked-out', 'auto-checkout'],
    default: 'checked-in'
  },
  autoCheckoutNote: {
    type: String,
    default: null
  },
  duration: {
    type: Number, // in minutes
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient queries
attendanceSchema.index({ studentID: 1, scanDate: 1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ checkInTime: 1 });

export default model('Attendance', attendanceSchema);