// models/ArchiveRequest.js
import { Schema, model } from 'mongoose';

const archiveRequestSchema = new Schema({
  fullName: { type: String, required: true },
  documentType: { type: String, required: true },
  documentTypeOther: { type: String },  // <-- add this
  purpose: { type: String, required: true },
  purposeOther: { type: String },       // <-- add this
  date: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
});

export default model('archiverequests', archiveRequestSchema);
