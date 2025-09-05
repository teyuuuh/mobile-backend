// models/Notification.js
import { Schema, model } from 'mongoose';

const notificationSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'reservation_approved',
      'reservation_cancelled', 
      'reservation_rejected',
      'reservation_converted_to_borrow',
      'archive_request_approved',
      'archive_request_rejected',
      'borrow_approved',
      'borrow_overdue',
      'room_reservation_approved',
      'room_reservation_rejected',
      'book_returned',
      'system_announcement',
      'settle_fines'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedId: {
    type: Schema.Types.ObjectId,
    required: false
  },
  relatedType: {
    type: String,
    enum: ['reserve', 'borrow', 'archive', 'room_reservation'],
    required: false
  },
  isRead: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  actionUrl: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

export default model('Notification', notificationSchema);