// utils/notificationService.js
import Notification from '../models/Notification.js';

class NotificationService {
  static async createNotification({
    userId,
    type,
    title,
    message,
    relatedId = null,
    relatedType = null,
    priority = 'medium',
    actionUrl = null
  }) {
    try {
      const notification = new Notification({
        userId,
        type,
        title,
        message,
        relatedId,
        relatedType,
        priority,
        actionUrl
      });

      await notification.save();
      console.log(`✅ Notification created for user ${userId}: ${title}`);
      return notification;
    } catch (error) {
      console.error('❌ Failed to create notification:', error);
      throw error;
    }
  }

  // Specific notification creators
  static async reservationApproved(userId, bookTitle, reservationId) {
    return this.createNotification({
      userId,
      type: 'reservation_approved',
      title: 'Reservation Approved',
      message: `Your reservation for "${bookTitle}" has been approved! You can now pick it up from the library.`,
      relatedId: reservationId,
      relatedType: 'reserve',
      priority: 'high',
      actionUrl: '/reserves'
    });
  }

  static async reservationConvertedToBorrow(userId, bookTitle, reservationId) {
    return this.createNotification({
      userId,
      type: 'reservation_converted_to_borrow',
      title: 'Reservation Converted to Borrow',
      message: `Your reservation for "${bookTitle}" has been converted to borrowed. The book is ready for pickup.`,
      relatedId: reservationId,
      relatedType: 'borrow',
      priority: 'high',
      actionUrl: '/borrows'
    });
  }

  static async reservationCancelled(userId, bookTitle, reservationId) {
    return this.createNotification({
      userId,
      type: 'reservation_cancelled',
      title: 'Reservation Cancelled',
      message: `Your reservation for "${bookTitle}" has been cancelled by the administrator.`,
      relatedId: reservationId,
      relatedType: 'reserve',
      priority: 'high',
      actionUrl: '/cancelled'
    });
  }

  static async borrowApproved(userId, bookTitle, borrowId) {
    return this.createNotification({
      userId,
      type: 'borrow_approved',
      title: 'Borrow Request Approved',
      message: `Your borrow request for "${bookTitle}" has been approved! The book is ready for pickup.`,
      relatedId: borrowId,
      relatedType: 'borrow',
      priority: 'high',
      actionUrl: '/borrows'
    });
  }

  static async bookReturned(userId, bookTitle, borrowId) {
    return this.createNotification({
      userId,
      type: 'book_returned',
      title: 'Book Return Confirmed',
      message: `Thank you for returning "${bookTitle}". Your return has been processed successfully.`,
      relatedId: borrowId,
      relatedType: 'borrow',
      priority: 'medium',
      actionUrl: '/borrows'
    });
  }

  static async roomReservationApproved(userId, roomName, reservationId) {
    return this.createNotification({
      userId,
      type: 'room_reservation_approved',
      title: 'Room Reservation Approved',
      message: `Your reservation for "${roomName}" has been approved! Please check your reservation details.`,
      relatedId: reservationId,
      relatedType: 'room_reservation',
      priority: 'medium',
      actionUrl: '/roommanage'
    });
  }

  static async roomReservationRejected(userId, roomName, reservationId) {
    return this.createNotification({
      userId,
      type: 'room_reservation_rejected',
      title: 'Room Reservation Rejected',
      message: `Your reservation for "${roomName}" has been rejected. Please try booking a different time slot.`,
      relatedId: reservationId,
      relatedType: 'room_reservation',
      priority: 'medium',
      actionUrl: '/roommanage'
    });
  }

  // Archive request notifications
  static async archiveRequestApproved(userId, documentType, requestId) {
    return this.createNotification({
      userId,
      type: 'archive_request_approved',
      title: 'Archive Request Approved',
      message: `Your archive request for "${documentType}" has been approved. You can now access the requested documents.`,
      relatedId: requestId,
      relatedType: 'archive_request',
      priority: 'medium',
      actionUrl: '/archives'
    });
  }

  static async archiveRequestRejected(userId, documentType, requestId) {
    return this.createNotification({
      userId,
      type: 'archive_request_rejected',
      title: 'Archive Request Rejected',
      message: `Your archive request for "${documentType}" has been rejected. Please contact administration for more details.`,
      relatedId: requestId,
      relatedType: 'archive_request',
      priority: 'medium',
      actionUrl: '/archives'
    });
  }

  // Overdue and fine notifications
  static async borrowDueTomorrow(userId, bookTitle, borrowId) {
    return this.createNotification({
      userId,
      type: 'borrow_due_tomorrow',
      title: 'Borrow Due Tomorrow',
      message: `Your borrowed learning material "${bookTitle}" is due tomorrow. Please return it on time to avoid fines.`,
      relatedId: borrowId,
      relatedType: 'borrow',
      priority: 'high',
      actionUrl: '/borrows'
    });
  }

  static async settleFines(userId, bookTitle, borrowId, daysOverdue, amountDue) {
    return this.createNotification({
      userId,
      type: 'settle_fines',
      title: 'Settle Your Outstanding Fines',
      message: `Your borrowed learning material "${bookTitle}" is ${daysOverdue} day(s) overdue. Please settle your outstanding fines of ₱${amountDue} at CLAMS, Lighthouse Building, AIMS Pasay.`,
      relatedId: borrowId,
      relatedType: 'borrow',
      priority: 'high',
      actionUrl: '/fines'
    });
  }

  // General system notifications
  static async systemAnnouncement(userId, title, message, actionUrl = null) {
    return this.createNotification({
      userId,
      type: 'system_announcement',
      title,
      message,
      relatedType: 'system',
      priority: 'medium',
      actionUrl
    });
  }

  // Bulk notification methods
  static async createBulkNotifications(notificationsData) {
    try {
      const notifications = notificationsData.map(data => new Notification(data));
      const result = await Notification.insertMany(notifications);
      console.log(`✅ Created ${result.length} bulk notifications`);
      return result;
    } catch (error) {
      console.error('❌ Failed to create bulk notifications:', error);
      throw error;
    }
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { isRead: true, readAt: new Date() },
        { new: true }
      );
      
      if (!notification) {
        throw new Error('Notification not found or unauthorized');
      }
      
      console.log(`✅ Notification ${notificationId} marked as read`);
      return notification;
    } catch (error) {
      console.error('❌ Failed to mark notification as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read for user
  static async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        { isRead: true, readAt: new Date() }
      );
      
      console.log(`✅ Marked ${result.modifiedCount} notifications as read for user ${userId}`);
      return result;
    } catch (error) {
      console.error('❌ Failed to mark all notifications as read:', error);
      throw error;
    }
  }

  // Get unread notifications count for user
  static async getUnreadCount(userId) {
    try {
      const count = await Notification.countDocuments({
        userId,
        isRead: false
      });
      
      return count;
    } catch (error) {
      console.error('❌ Failed to get unread notifications count:', error);
      throw error;
    }
  }

  // Get notifications for user with pagination
  static async getUserNotifications(userId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const notifications = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await Notification.countDocuments({ userId });
      
      return {
        notifications,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalNotifications: total,
        hasMore: page * limit < total
      };
    } catch (error) {
      console.error('❌ Failed to get user notifications:', error);
      throw error;
    }
  }
}

export default NotificationService;