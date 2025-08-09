
import { Schema, model } from 'mongoose';

// models/ReserveRequest.js
const reserveRequestSchema = new Schema({
  userName: { type: String, required: true },
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'lms_user', 
    required: true 
  },
  bookTitle: { type: String, required: true },
  bookId: { 
    type: Schema.Types.ObjectId, 
    ref: 'LearningMaterial',
    required: true
  },
  author: String,
  reservationDate: { 
    type: Date, 
    default: Date.now,
    required: true
  },
  pickupDate: { 
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        // Pickup date must be within 3 days of reservation
        const maxDate = new Date(this.reservationDate);
        maxDate.setDate(maxDate.getDate() + 3);
        return value <= maxDate;
      },
      message: 'Pickup date must be within 3 days of reservation'
    }
  },
  status: { 
    type: String, 
    enum: ['pending', 'borrowed', 'available', 'cancelled', 'overdue'], 
    default: 'pending' 
  },
  createdAt: { type: Date, default: Date.now }
});

export default model('ReserveRequest', reserveRequestSchema);
