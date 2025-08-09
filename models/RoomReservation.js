// models/RoomReservation.js
import { Schema, model } from 'mongoose';

const roomReservationSchema = new Schema({
  name: { type: String, required: true },
  idNumber: { type: String, required: true },
  courseDepartment: { type: String, required: true },
  participants: { type: Number, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  room: { type: String, required: true },
  purpose: { type: String, required: true },
  artifactName: { type: String },
  userId: { type: String, required: true },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

// Only export the model, not individual methods
export default model('roomreservations', roomReservationSchema);