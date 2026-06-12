import { Schema, model, models, Document } from 'mongoose';

export interface ICorporateActionLog extends Document {
  symbol: string;
  exDate: string;
  type: 'dividend' | 'split';
  processedAt: Date;
}

const CorporateActionLogSchema = new Schema<ICorporateActionLog>({
  symbol: { type: String, required: true, uppercase: true },
  exDate: { type: String, required: true },
  type: { type: String, enum: ['dividend', 'split'], required: true },
  processedAt: { type: Date, default: Date.now }
});

CorporateActionLogSchema.index({ symbol: 1, exDate: 1, type: 1 }, { unique: true });

const CorporateActionLog = models.CorporateActionLog || model<ICorporateActionLog>('CorporateActionLog', CorporateActionLogSchema);
export default CorporateActionLog;
