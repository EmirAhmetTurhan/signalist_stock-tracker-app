import { Schema, model, models, Document } from 'mongoose';

export interface INotification extends Document {
  userId: string;
  type: 'ai_job_completed' | 'ai_job_failed' | 'smart_alert_triggered' | 'report_ready';
  title: string;
  message: string;
  status: 'unread' | 'read' | 'archived';
  jobId?: string;
  reportId?: string;
  actionUrl?: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['ai_job_completed', 'ai_job_failed', 'smart_alert_triggered', 'report_ready'], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['unread', 'read', 'archived'], default: 'unread', index: true },
  jobId: { type: String },
  reportId: { type: String },
  actionUrl: { type: String },
  readAt: { type: Date }
}, {
  timestamps: true,
});

const Notification = models.Notification || model<INotification>('Notification', NotificationSchema);

export default Notification;
