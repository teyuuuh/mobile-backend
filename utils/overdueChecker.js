// utils/overdueChecker.js
import BorrowRequest from '../models/BorrowRequest.js';

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

    console.log(`Updated ${result.modifiedCount} books to overdue status`);
    return result.modifiedCount;
  } catch (error) {
    console.error('Error updating overdue books:', error);
    return 0;
  }
}

function startOverdueChecker() {
  // Initial check
  checkOverdueBooks();
  
  // Set up daily check
  setInterval(checkOverdueBooks, 24 * 60 * 60 * 1000);
}

export { checkOverdueBooks, startOverdueChecker };