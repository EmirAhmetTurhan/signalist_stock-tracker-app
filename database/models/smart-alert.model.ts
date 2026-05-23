import mongoose, { Document, Model, Schema, models } from 'mongoose';

export interface SmartCondition {
  indicator: string;
  operator: '<' | '>' | 'cross_above' | 'cross_below';
  value: number;
}

export interface SmartAlert extends Document {
  userId: string;
  email: string;
  name: string;
  symbol: string;
  interval: '1d' | '4h';
  conditions: SmartCondition[];
  active: boolean;
  frequency: 'daily' | '4h' | '1h';
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SmartConditionSchema = new Schema<SmartCondition>(
  {
    indicator: { type: String, required: true },
    operator: { type: String, enum: ['<', '>', 'cross_above', 'cross_below'], required: true },
    value: { type: Number, required: true },
  },
  { _id: false }
);

const SmartAlertSchema = new Schema<SmartAlert>(
  {
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true },
    name: { type: String, required: true, maxlength: 100 },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    interval: { type: String, enum: ['1d', '4h'], default: '1d' },
    conditions: { type: [SmartConditionSchema], required: true },
    active: { type: Boolean, default: true },
    frequency: { type: String, enum: ['daily', '4h', '1h'], default: 'daily' },
    lastTriggeredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SmartAlertSchema.index({ active: 1, frequency: 1, symbol: 1 });

export const SmartAlert: Model<SmartAlert> =
  (models?.SmartAlert as Model<SmartAlert>) ||
  mongoose.model<SmartAlert>('SmartAlert', SmartAlertSchema);
