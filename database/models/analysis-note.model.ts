import mongoose, { Document, Model, Schema, models } from 'mongoose';

export interface AnalysisNote extends Document {
  userId: string;
  conversationId?: mongoose.Types.ObjectId;
  title: string;
  symbol?: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AnalysisNoteSchema = new Schema<AnalysisNote>(
  {
    userId: { type: String, required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
    title: { type: String, required: true, maxlength: 200 },
    symbol: { type: String, uppercase: true, trim: true },
    content: { type: String, required: true, maxlength: 50000 },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

AnalysisNoteSchema.index({ userId: 1, symbol: 1 });
AnalysisNoteSchema.index({ userId: 1, createdAt: -1 });

export const AnalysisNote: Model<AnalysisNote> =
  (models?.AnalysisNote as Model<AnalysisNote>) ||
  mongoose.model<AnalysisNote>('AnalysisNote', AnalysisNoteSchema);
