import BorrowRequest from '../models/BorrowRequest.js';
import LearningMaterial from '../models/LearningMaterials.js';

async function updateOverdueStatus() {
  try {
    const now = new Date();
    // Find all overdue requests (both currently marked as borrowed and those past return date)
    const overdueRequests = await BorrowRequest.find({
      $or: [
        { returnDate: { $lt: now }, status: 'borrowed' },
        { status: 'overdue' }
      ]
    });

    for (const request of overdueRequests) {
      const returnDate = new Date(request.returnDate);
      const daysOverdue = Math.floor((now - returnDate) / (1000 * 60 * 60 * 24));
      
      // Only update if it's not already marked as overdue or if daysOverdue changed
      if (request.status !== 'overdue' || request.daysOverdue !== daysOverdue) {
        await BorrowRequest.findByIdAndUpdate(request._id, {
          status: 'overdue',
          daysOverdue,
          lastStatusUpdate: now
        });
        
        // Update corresponding material status
        await LearningMaterial.findByIdAndUpdate(request.materialId, {
          status: 'overdue'
        });
      }
    }
  } catch (error) {
    console.error('Error updating overdue status:', error);
  }
}


async function checkUnclaimedRequests() {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const unclaimedRequests = await BorrowRequest.find({
      borrowDate: { $lt: oneDayAgo },
      status: 'pending'
    });

    await BorrowRequest.updateMany(
      { _id: { $in: unclaimedRequests.map(r => r._id) } },
      { $set: { status: 'cancelled' } }
    );

    // Update corresponding materials
    await LearningMaterial.updateMany(
      { _id: { $in: unclaimedRequests.map(r => r.materialId) } },
      { $set: { status: 'available' } }
    );
  } catch (error) {
    console.error('Error checking unclaimed requests:', error);
  }
}


export { updateOverdueStatus,checkUnclaimedRequests};
