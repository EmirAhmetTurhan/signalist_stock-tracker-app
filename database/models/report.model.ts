import mongoose, { Document, Model, Schema, models } from 'mongoose';

// ─── Discovery-Specific Types ────────────────────────────────────────────────────

/** Configuration used for a discovery job. */
export interface DiscoveryConfig {
  symbol: string;
  interval: string;
  years: number;
  minIndicators?: number;
  maxIndicators?: number;
  topN?: number;
}

/** A validated strategy result from the 5-phase pipeline. */
export interface DiscoveryStrategyResult {
  combo: string[];
  bestParams: Record<string, number>;
  bestWinRate: number;
  validatedWinRate: number;
  overfittingRisk: number;
  riskLevel: 'low' | 'medium' | 'high';
  totalSignals: number;
  rank: number;
  badge: string;

  // ─── Multi-Metric (Phase 2b+) ───
  profitFactor?: number;
  sharpeRatio?: number;
  avgWin?: number;
  avgLoss?: number;
  maxDrawdown?: number;
  totalReturn?: number;
  regimeBreakdown?: Record<string, {
    winRate: number;
    totalSignals: number;
    wins: number;
    avgReturn: number;
    totalReturn: number;
  }>;
}

// ─── Report Interface ────────────────────────────────────────────────────────────

export type ReportType = 'analysis' | 'discovery';

export interface AnalysisReport extends Document {
  jobId: string;
  userId: string;
  symbol: string;
  /** @deprecated Use type + discoveryResults for discovery reports. Kept for backward compat. */
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

  // ── Discovery-specific fields (Phase 2b) ──
  /** Report type: 'analysis' (single indicator) or 'discovery' (strategy search). */
  type?: ReportType;
  /** Top validated strategies from the discovery pipeline. */
  discoveryResults?: DiscoveryStrategyResult[];
  /** Configuration used for this discovery run. */
  discoveryConfig?: DiscoveryConfig;
  /** Total number of combinations screened in Phase 2. */
  totalCombinationsScreened?: number;
  /** Total execution time in milliseconds. */
  discoveryDuration?: number;

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

    // Discovery-specific fields
    type: { type: String, enum: ['analysis', 'discovery'], default: 'analysis' },
    discoveryResults: { type: [Schema.Types.Mixed], default: undefined },
    discoveryConfig: { type: Schema.Types.Mixed, default: undefined },
    totalCombinationsScreened: { type: Number, default: undefined },
    discoveryDuration: { type: Number, default: undefined },
  },
  { timestamps: true }
);

// Index for fetching discovery reports efficiently
ReportSchema.index({ type: 1, userId: 1, createdAt: -1 });

export const Report: Model<AnalysisReport> =
  (models?.Report as Model<AnalysisReport>) ||
  mongoose.model<AnalysisReport>('Report', ReportSchema);
