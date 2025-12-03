import mongoose, { Document, Model, Schema, models } from 'mongoose';

export interface PriceAlertItem extends Document {
  userId: string;
  email: string;
  symbol: string;
  company: string;
  alertName: string;
  alertType: 'upper' | 'lower';
  threshold: number;
  frequency: 'daily';
  active: boolean;
  lastNotifiedOn?: Date | null;
  createdAt: Date;
}

const PriceAlertSchema = new Schema<PriceAlertItem>(
  {
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    company: { type: String, required: true, trim: true },
    alertName: { type: String, required: true, trim: true },
    alertType: { type: String, enum: ['upper', 'lower'], required: true },
    threshold: { type: Number, required: true },
    frequency: { type: String, enum: ['daily'], default: 'daily' },
    active: { type: Boolean, default: true },
    lastNotifiedOn: { type: Date, default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

// Helpful compound index for querying active daily alerts per symbol
PriceAlertSchema.index({ active: 1, frequency: 1, symbol: 1 });
PriceAlertSchema.index({ userId: 1, symbol: 1 });

export const PriceAlert: Model<PriceAlertItem> =
  (models?.PriceAlert as Model<PriceAlertItem>) ||
  mongoose.model<PriceAlertItem>('PriceAlert', PriceAlertSchema);

export default PriceAlert;
