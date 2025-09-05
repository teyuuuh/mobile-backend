// utils/overdueChecker.js
import BorrowRequest from '../models/BorrowRequest.js';
import Notification from '../models/Notification.js'; 

async function checkOverdueBooks() {
  try {
    const now = new Date();
    
    // Update overdue books
    const result = await BorrowRequest.updateMany(
      {
        returnDate: { $lt: now },
        status: { $in: ['pending', 'borrowed'] }
      },
      {
        $set: { status: 'overdue' }
      }
    );
    console.log(`Updated ${result.modifiedCount} books to overdue status`);

    // Check for books due tomorrow and send notifications
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const startOfTomorrow = new Date(tomorrow.setHours(0, 0, 0, 0));
    const endOfTomorrow = new Date(tomorrow.setHours(23, 59, 59, 999));
    
    const dueTomorrow = await BorrowRequest.find({
      status: 'borrowed',
      returnDate: { $gte: startOfTomorrow, $lte: endOfTomorrow }
    });

    for (const borrow of dueTomorrow) {
      const alreadyNotified = await Notification.findOne({
        userId: borrow.userId,
        type: 'borrow_due_tomorrow',
        relatedId: borrow._id
      });
      
      if (!alreadyNotified) {
        await Notification.create({
          userId: borrow.userId,
          type: 'borrow_due_tomorrow',
          title: 'Borrow Due Tomorrow',
          message: `Your borrowed learning material "${borrow.bookTitle}" is due tomorrow. Please return it on time to avoid fines.`,
          relatedId: borrow._id,
          isRead: false,
          createdAt: new Date()
        });
        console.log(`Created due tomorrow notification for user ${borrow.userId}`);
      }
    }

    // Check for overdue books and send fine notifications
    const overdueBorrows = await BorrowRequest.find({
      status: 'overdue'
    });

    for (const borrow of overdueBorrows) {
      const alreadyNotified = await Notification.findOne({
        userId: borrow.userId,
        type: 'settle_fines',
        relatedId: borrow._id,
        createdAt: { 
          $gte: new Date(new Date().setDate(new Date().getDate() - 1)) // Check if notified in last 24 hours
        }
      });
      
      if (!alreadyNotified) {
        // Calculate days overdue and amount due
        const returnDate = new Date(borrow.returnDate);
        const timeDiff = now.getTime() - returnDate.getTime();
        const daysOverdue = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
        const amountDue = daysOverdue * 10; // ₱10 per day

        await Notification.create({
          userId: borrow.userId,
          type: 'settle_fines',
          title: 'Settle Your Outstanding Fines',
          message: `Your borrowed learning material "${borrow.bookTitle}" is ${daysOverdue} day(s) overdue. Please settle your outstanding fines of ₱${amountDue} at CLAMS, Lighthouse Building, AIMS Pasay.`,
          relatedId: borrow._id,
          isRead: false,
          createdAt: new Date()
        });
        console.log(`Created fine notification for user ${borrow.userId}`);
      }
    }

    return result.modifiedCount;
  } catch (error) {
    console.error('Error updating overdue books:', error);
    return 0;
  }
}

// Run immediately and then every 24 hours
function startOverdueChecker() {
  console.log('Starting overdue checker...');
  
  // Initial check
  checkOverdueBooks().then(count => {
    console.log(`Initial overdue check completed. Updated ${count} books.`);
  }).catch(error => {
    console.error('Initial overdue check failed:', error);
  });
  
  // Set up daily check (every 24 hours)
  setInterval(() => {
    console.log('Running scheduled overdue check...');
    checkOverdueBooks().then(count => {
      console.log(`Scheduled overdue check completed. Updated ${count} books.`);
    }).catch(error => {
      console.error('Scheduled overdue check failed:', error);
    });
  }, 24 * 60 * 60 * 1000);
}

export { checkOverdueBooks, startOverdueChecker };