// models/ArchiveRequest.js
import { Schema, model } from 'mongoose';



const archiveRequestSchema = new Schema({
  fullName: { type: String, required: true },
  documentType: { type: String, required: true },
  purpose: { type: String, required: true },
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
  createdAt: { type: Date, default: Date.now }
});

export default model('archiverequests', archiveRequestSchema);