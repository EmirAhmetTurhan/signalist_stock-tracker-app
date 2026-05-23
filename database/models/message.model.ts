import mongoose, { Document, Model, Schema, models } from 'mongoose';

export interface ChatMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  userId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  parts: Record<string, unknown>[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<ChatMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system', 'tool'], required: true },
    parts: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message: Model<ChatMessage> =
  (models?.Message as Model<ChatMessage>) ||
  mongoose.model<ChatMessage>('Message', MessageSchema);
