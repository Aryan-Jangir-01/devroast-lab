export type InputType = "github_readme" | "resume_bullets" | "project_pitch";

export type ExperienceLevel = "student" | "mid" | "senior";

export type RoastStrategyVariant = "brutal_checklist" | "guided_coach";

export type UnlockFlowVariant = "instant_reveal" | "interactive_step";

export type TrafficSource = "live" | "simulated";

export interface VisitorTraits {
  role: string;
  experience_level: ExperienceLevel;
  input_type: InputType;
}

export interface RedFlagItem {
  id: string;
  severity: "high" | "medium" | "tip";
  title: string;
  detail: string;
  beforeSnippet?: string;
  afterSnippet?: string;
}

export interface GuidedCoachStep {
  stepNumber: number;
  title: string;
  diagnosticPrompt: string;
  coachTip: string;
  exampleImprovement: string;
  quickChips?: string[];
  inputPlaceholder?: string;
}

export interface RoastAnalysisResult {
  overallScore: number;
  verdictBadge: string;
  roastHeadline: string;
  metricsBreakdown: {
    impactScore: number;
    clarityScore: number;
    actionabilityScore: number;
    readabilityScore: number;
  };
  detectedStack: string[];
  redFlags: RedFlagItem[];
  checklistFixes: string[];
  guidedSteps: GuidedCoachStep[];
  rewrittenText: string;
  engineSource: string;
}

export interface VariantCounter {
  variant: RoastStrategyVariant;
  exposures: number;
  completions: number;
  rewriteCopies: number;
  helpfulVotes: number;
  ratingSum: number;
  ratingCount: number;
  totalTimeToCopyMs: number;
}

export interface CohortCounter {
  cohortKey: string;
  label: string;
  variants: Record<RoastStrategyVariant, { exposures: number; rewriteCopies: number }>;
}

export interface FeedEntry {
  id: string;
  timestamp: string;
  inputType: InputType;
  experienceLevel: ExperienceLevel;
  role?: string;
  variant: RoastStrategyVariant;
  unlockVariant?: UnlockFlowVariant;
  trafficSource?: TrafficSource;
  score: number;
  copiedRewrite: boolean;
  rating: number | null;
}

export interface ExperimentStoreData {
  weights: Record<RoastStrategyVariant, number>;
  unlockWeights: Record<UnlockFlowVariant, number>;
  scoreboardEnabled: boolean;
  variants: Record<RoastStrategyVariant, VariantCounter>;
  unlockVariants: Record<UnlockFlowVariant, { exposures: number; rewriteCopies: number }>;
  cohorts: Record<string, CohortCounter>;
  experienceCohorts?: Record<ExperienceLevel, CohortCounter>;
  recentFeed: FeedEntry[];
}

export interface BayesianVariantMetrics {
  variant: RoastStrategyVariant;
  label: string;
  trafficPercent: number;
  exposures: number;
  completions: number;
  rewriteCopies: number;
  helpfulVotes: number;
  ratingCount: number;
  completionRate: number;
  copyConversionRate: number;
  helpfulRate: number;
  avgHelpfulness: number;
  avgTimeToCopyMs: number;
  chanceToWin: number;
  liftVsControlPercent: number;
  credibleInterval95: [number, number];
}

export interface UnlockVariantMetrics {
  variant: UnlockFlowVariant;
  label: string;
  trafficPercent: number;
  exposures: number;
  rewriteCopies: number;
  copyConversionRate: number;
  chanceToWin: number;
}

export interface CohortComparisonRow {
  cohortKey: string;
  label: string;
  brutalCopyRate: number;
  coachCopyRate: number;
  brutalExposures: number;
  coachExposures: number;
}

export interface BayesianScoreboard {
  experimentKey: string;
  primaryMetric: string;
  totalExposures: number;
  totalCopies: number;
  leadingVariant: RoastStrategyVariant;
  winnerConfidenceMet: boolean;
  minSamplesPerArmTarget: number;
  minSamplesObserved: number;
  samplesNeeded: number;
  sampleRatioMismatch: {
    expectedSplitA: number;
    actualSplitA: number;
    chiSquare: number;
    hasMismatch: boolean;
  };
  summary: string;
  variants: BayesianVariantMetrics[];
  unlockExperiment: {
    experimentKey: "rewrite_unlock_flow";
    leadingVariant: UnlockFlowVariant;
    variants: UnlockVariantMetrics[];
  };
  cohorts: CohortComparisonRow[];
  experienceCohorts: CohortComparisonRow[];
}

export interface RuntimeConfigInternal {
  flagsmithApiUrl: string;
  flagsmithSdkApiUrl: string;
  publicFlagsmithEnvKey: string;
  flagsmithApiKey: string;
  flagsmithProjectId: string;
  flagsmithEnvKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  upstashRedisRestUrl: string;
  upstashRedisRestToken: string;
  adminKey: string;
}

export interface ConnectionStatusPublic {
  mode: "live_flagsmith" | "local_experiment_mode";
  publicFlagsmithEnvKey: string;
  flagsmithApiUrl: string;
  flagsmithProjectId: string;
  hasManagementKey: boolean;
  hasGeminiKey: boolean;
  hasOpenAiKey: boolean;
  hasAnthropicKey: boolean;
  activeLlmProvider: "gemini" | "openai" | "anthropic" | "rubric";
  storageBackend: "upstash_redis" | "filesystem" | "tmp_fallback" | "memory";
  adminProtected: boolean;
}

export interface FlagsmithEventLogEntry {
  id: string;
  timestamp: string;
  kind: "identify" | "exposure" | "track" | "flush" | "sync";
  name: string;
  detail: string;
  mode: "live_flagsmith" | "local_experiment_mode";
  payload: Record<string, unknown>;
}
