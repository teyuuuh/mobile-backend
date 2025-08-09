
import { Schema, model } from 'mongoose';

const learningMaterialSchema = new Schema({
  name: { type: String, required: true },
  yearofpub: String,
  accessionNumber: { type: String, required: true, unique: true },
  author: String,
  edition: String,
  typeofmat: { 
    type: String,
    required: true
  },
  status: { 
    type: String, 
    enum: ['available', 'reserved', 'pending', 'borrowed', 'overdue', 'cancelled'],
    default: 'available'
  },
  price: String,
  description: String,
  summary: String,
  isbn: String,
  issn: String,
  imageUrl: String,
  totalCopies: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value'
    }
  },
  availableCopies: {
    type: Number,
    required: true,
    default: 1,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value'
    }
  },
  createdAt: { type: Date, default: Date.now },
  averageRating: {
  type: Number,
  default: 0,
  min: 0,
  max: 5
},
ratingCount: {
  type: Number,
  default: 0
}
});

// Add the pre-save hook after the schema is defined
learningMaterialSchema.pre('save', async function(next) {
  if (this.isModified('status')) {
    // If changing to available, verify no active borrows/reservations
    if (this.status === 'available') {
      const BorrowRequest = model('BorrowRequest');
      const ReserveRequest = model('ReserveRequest');
      
      const [activeBorrow, activeReservation] = await Promise.all([
        BorrowRequest.findOne({ 
          materialId: this._id, 
          status: { $in: ['pending', 'borrowed'] }
        }),
        ReserveRequest.findOne({
          bookId: this._id,
          status: { $in: ['pending', 'approved', 'active'] }
        })
      ]);
      
      if (activeBorrow || activeReservation) {
        throw new Error('Cannot set to available - active transactions exist');
      }
    }
  }
  next();
});

export default model('LearningMaterial', learningMaterialSchema, 'learningmaterials');
