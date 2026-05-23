import mongoose, { Document, Model, Schema, models } from 'mongoose';

export interface AnalysisReport extends Document {
  jobId: string;
  userId: string;
  symbol: string;
  indicator: string;
  bestValue: number | null;
  winRate: number | null;
  status: 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  steps: any[];
  fullData: Record<string, unknown> | null;
  aiCommentary?: string;
  artifactGroupId?: string;
  version?: number;
  previousArtifactId?: string;
  rerunOfArtifactId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<AnalysisReport>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    symbol: { type: String, required: true },
    indicator: { type: String, required: true },
    bestValue: { type: Number, default: null },
    winRate: { type: Number, default: null },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    errorMessage: { type: String, default: null },
    steps: { type: Schema.Types.Mixed, default: [] },
    fullData: { type: Schema.Types.Mixed, default: null },
    aiCommentary: { type: String },
    artifactGroupId: { type: String, index: true },
    version: { type: Number, default: 1 },
    previousArtifactId: { type: String },
    rerunOfArtifactId: { type: String },
  },
  { timestamps: true }
);

export const Report: Model<AnalysisReport> =
  (models?.Report as Model<AnalysisReport>) ||
  mongoose.model<AnalysisReport>('Report', ReportSchema);
