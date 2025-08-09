import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  userName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['feedback', 'suggestion'],
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: function() { return this.type === 'feedback'; }
  },
  comment: {
    type: String,
    required: function() { return this.type === 'feedback'; }
  },
  bookTitle: {
    type: String,
    required: function() { return this.type === 'suggestion'; }
  },
  author: {
    type: String,
    required: function() { return this.type === 'suggestion'; }
  },
  edition: String,
  reason: {
    type: String,
    required: function() { return this.type === 'suggestion'; }
  },
  date: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['new', 'reviewed', 'actioned', 'rejected'],
    default: 'new'
  }
});

export default mongoose.model('Feedback', feedbackSchema);