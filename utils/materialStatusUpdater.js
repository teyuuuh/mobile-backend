// utils/materialStatusUpdater.js
import BorrowRequest from '../models/BorrowRequest.js';
import LearningMaterial from '../models/LearningMaterials.js';

async function updateMaterialStatuses() {
  try {
    // Get all materials that have active transactions
    const activeMaterials = await BorrowRequest.aggregate([
      {
        $match: {
          status: { $in: ['pending', 'borrowed', 'overdue'] }
        }
      },
      {
        $group: {
          _id: '$materialId',
          statuses: { $addToSet: '$status' }
        }
      }
    ]);

    // Create bulk operations
    const bulkOps = activeMaterials.map(material => {
      let status = 'available';
      if (material.statuses.includes('borrowed') || material.statuses.includes('overdue')) {
        status = 'borrowed';
      } else if (material.statuses.includes('pending')) {
        status = 'pending';
      }

      return {
        updateOne: {
          filter: { _id: material._id },
          update: { $set: { status } }
        }
      };
    });

    // Update all affected materials
    if (bulkOps.length > 0) {
      await LearningMaterial.bulkWrite(bulkOps);
    }

    // Reset status for materials with no active transactions
    await LearningMaterial.updateMany(
      { _id: { $nin: activeMaterials.map(m => m._id) } },
      { $set: { status: 'available' } }
    );

    console.log(`Updated status for ${activeMaterials.length} materials`);
  } catch (error) {
    console.error('Error syncing material statuses:', error);
    throw error;
  }
}

export { updateMaterialStatuses };