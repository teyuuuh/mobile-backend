// utils/scheduler.js
import { schedule } from 'node-cron';
import BorrowRequest from '../models/BorrowRequest.js';
import ReserveRequest from '../models/ReserveRequest.js';
import LearningMaterial from '../models/LearningMaterials.js';
import { updateMaterialStatuses } from './materialStatusUpdater.js';

async function expireReservations() {
  try {
    const now = new Date();
    const result = await ReserveRequest.updateMany(
      {
        pickupDate: { $lt: now },
        status: { $in: ['pending', 'approved'] }
      },
      { $set: { status: 'expired' } }
    );

    console.log(`Expired ${result.modifiedCount} reservations`);
    await updateMaterialStatuses();
  } catch (error) {
    console.error('Error expiring reservations:', error);
  }
}

async function checkOverdueBooks() {
  try {
    const now = new Date();
    const result = await BorrowRequest.updateMany(
      {
        returnDate: { $lt: now },
        status: { $in: ['pending', 'borrowed'] }
      },
      { $set: { status: 'overdue' } }
    );

    console.log(`Marked ${result.modifiedCount} books as overdue`);
    await updateMaterialStatuses();
  } catch (error) {
    console.error('Error updating overdue books:', error);
  }
}

function startScheduler() {
  // Run every hour
  schedule('0 * * * *', () => {
    Promise.all([
      expireReservations(),
      checkOverdueBooks()
    ]).catch(console.error);
  });

  // Run status update every 6 hours
  schedule('0 */6 * * *', updateMaterialStatuses);

  console.log('Scheduler started successfully');
}

export default { startScheduler };