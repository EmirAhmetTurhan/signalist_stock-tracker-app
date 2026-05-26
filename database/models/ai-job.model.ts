import { Schema, model, models, Document } from 'mongoose';

export interface IStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
  completedAt?: Date;
}

export interface IAIJob extends Document {
  jobId: string;
  userId: string;
  type: 'optimize_parameter' | 'rank_indicators' | 'find_best_indicator' | 'batch_watchlist_scan' | 'scheduled_scan' | 'process_chat_message';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  title: string;
  source: 'chat' | 'notebook' | 'scheduled' | 'watchlist';
  conversationId?: string;
  reportId?: string;
  parentJobId?: string;
  batchId?: string;
  input?: Record<string, any>;
  progress: number;
  steps: IStep[];
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  cancellationRequested: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StepSchema = new Schema<IStep>({
  name: { type: String, required: true },
  status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
  detail: { type: String },
  completedAt: { type: Date }
}, { _id: false });

const AIJobSchema = new Schema<IAIJob>({
  jobId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['optimize_parameter', 'rank_indicators', 'find_best_indicator', 'batch_watchlist_scan', 'scheduled_scan', 'process_chat_message'], required: true },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'cancelled'], default: 'queued', index: true },
  title: { type: String, required: true },
  source: { type: String, enum: ['chat', 'notebook', 'scheduled', 'watchlist'], default: 'chat' },
  conversationId: { type: String },
  reportId: { type: String },
  parentJobId: { type: String },
  batchId: { type: String },
  input: { type: Schema.Types.Mixed },
  progress: { type: Number, default: 0 },
  steps: [StepSchema],
  errorMessage: { type: String },
  startedAt: { type: Date },
  completedAt: { type: Date },
  cancellationRequested: { type: Boolean, default: false }
}, {
  timestamps: true,
});

const AIJob = models.AIJob || model<IAIJob>('AIJob', AIJobSchema);

export default AIJob;
