import mongoose, { Document, Model, Schema, models } from 'mongoose';

export interface Conversation extends Document {
  userId: string;
  title: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<Conversation>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 100 },
    isPinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ConversationSchema.index({ userId: 1, updatedAt: -1 });

export const Conversation: Model<Conversation> =
  (models?.Conversation as Model<Conversation>) ||
  mongoose.model<Conversation>('Conversation', ConversationSchema);
