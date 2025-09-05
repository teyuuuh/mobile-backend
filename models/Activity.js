// models/Activity.js
import { Schema, model } from 'mongoose';

const ActivitySchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
   firstName: { type: String }, 
   lastName: { type: String },
  email: { type: String },   
  role: { type: String },  
  action: { 
    type: String, 
    required: true,
    enum: [
      'login', 
      'logout', 
      'borrow_add', 
      'return', 
      'reserve_add', 
      'fine', 
      'payment', 
      'profile_update', 
      'bookmark_add',
      'bookmark_remove', 
      'login_success', 
      'login_failed', 
      'login_blocked', 
      'history_add', 
      'roomreserve_add', 
      'feedback_add', 
      'suggestion_add', 
      'archiverequest_add', 
      'learnmat_create', 
      'learnmat_update', 
      'learnmat_delete', 
      'learnmat_view', 
      'admin_borrow_create',
      'otp_requested', 
      'otp_verified', 
      'password_reset_requested', 
      'password_reset_completed',       'email_verification_sent',      'email_verified', 
      'admin_created',       'status_change' 
    ]
  },
  details: { type: String, required: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: Schema.Types.Mixed } 
}, {
  timestamps: true,
  collection: 'activities'
});

// Index for better performance
ActivitySchema.index({ userId: 1, timestamp: -1 });
ActivitySchema.index({ action: 1, timestamp: -1 });

export default model('Activity', ActivitySchema);