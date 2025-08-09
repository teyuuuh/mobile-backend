import { Schema, model } from 'mongoose';

const borrowRequestSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'lms_user', required: true },
  materialId: { type: Schema.Types.ObjectId, ref: 'LearningMaterial', required: true },
  userName: String,
  imageUrl: String,
  bookTitle: String,
  author: String,
  borrowDate: Date,
  returnDate: Date,
  status: { 
    type: String, 
    enum: ['pending', 'borrowed', 'cancelled', 'available', 'overdue'], 
    default: 'pending' 
  },
  daysOverdue: { type: Number, default: 0 },
  paymentStatus: { 
    type: String, 
    enum: ['unpaid', 'paid', 'pending'], 
    default: 'unpaid' 
  },
  amountDue: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

export default model('BorrowRequest', borrowRequestSchema);