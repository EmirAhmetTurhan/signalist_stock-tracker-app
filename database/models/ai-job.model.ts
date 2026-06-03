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
  type: 'optimize_parameter' | 'rank_indicators' | 'find_best_indicator' | 'batch_watchlist_scan' | 'scheduled_scan' | 'process_chat_message' | 'deep_discovery';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  title: string;
  source: 'chat' | 'notebook' | 'scheduled' | 'watchlist' | 'discovery';
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
  // Deep Discovery fields
  currentPhase?: number;
  phaseDetail?: string;
  intermediateResults?: Record<string, any>;
  discoveryResults?: Record<string, any>[];
  executionTimes?: Record<string, number>;
  seed?: number;
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
  type: { type: String, enum: ['optimize_parameter', 'rank_indicators', 'find_best_indicator', 'batch_watchlist_scan', 'scheduled_scan', 'process_chat_message', 'deep_discovery'], required: true },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'cancelled'], default: 'queued', index: true },
  title: { type: String, required: true },
  source: { type: String, enum: ['chat', 'notebook', 'scheduled', 'watchlist', 'discovery'], default: 'chat' },
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
  cancellationRequested: { type: Boolean, default: false },
  // Deep Discovery fields
  currentPhase: { type: Number },
  phaseDetail: { type: String },
  intermediateResults: { type: Schema.Types.Mixed },
  discoveryResults: [{ type: Schema.Types.Mixed }],
  executionTimes: { type: Schema.Types.Mixed },
  seed: { type: Number }
}, {
  timestamps: true,
});

// ── Partial Unique Index ──────────────────────────────────────────────────
// Prevents duplicate active jobs for the same user & type at the database level.
// Only applies to documents with status 'queued' or 'running', so completed/
// cancelled/failed jobs don't block new ones. This is the last line of defense
// against the TOCTOU race condition in the API route.
AIJobSchema.index(
  { userId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['queued', 'running'] },
    },
  },
);

const AIJob = models.AIJob || model<IAIJob>('AIJob', AIJobSchema);

export default AIJob;
