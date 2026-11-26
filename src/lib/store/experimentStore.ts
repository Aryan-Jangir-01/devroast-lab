import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IState } from "@flagsmith/flagsmith/types";
import type {
  CohortCounter,
  ConnectionStatusPublic,
  ExperienceLevel,
  ExperimentStoreData,
  RoastStrategyVariant,
  RuntimeConfigInternal,
  UnlockFlowVariant,
  VisitorTraits,
} from "@/lib/types";

const PRIMARY_DATA_DIR = path.join(process.cwd(), ".devroast");
const TMP_DATA_DIR = path.join(os.tmpdir(), "devroast-lab");

let activeDataDir = PRIMARY_DATA_DIR;
let activeStorageBackend: "filesystem" | "tmp_fallback" | "memory" = "filesystem";
let memoryStoreCache: ExperimentStoreData | null = null;
let memoryConfigCache: Partial<RuntimeConfigInternal> | null = null;

let writeQueue: Promise<unknown> = Promise.resolve();

export function withExperimentLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function getStoreFile(dir = activeDataDir): string {
  return path.join(dir, "experiments.json");
}

function getConfigFile(dir = activeDataDir): string {
  return path.join(dir, "config.json");
}

function resolveJsonPath(dir: string, fileName: "experiments.json" | "config.json"): string {
  return path.join(/*turbopackIgnore: true*/ dir, fileName);
}

async function readJsonFromDirs<T>(
  fileName: "experiments.json" | "config.json"
): Promise<T | null> {
  for (const dir of [activeDataDir, PRIMARY_DATA_DIR, TMP_DATA_DIR]) {
    try {
      const target = resolveJsonPath(dir, fileName);
      const raw = await fs.readFile(/*turbopackIgnore: true*/ target, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      // Try next candidate directory
    }
  }
  return null;
}

async function writeJsonSafe(
  fileName: "experiments.json" | "config.json",
  payload: unknown
): Promise<boolean> {
  const serialized = JSON.stringify(payload, null, 2);
  const dirs =
    activeDataDir === TMP_DATA_DIR
      ? [TMP_DATA_DIR]
      : [PRIMARY_DATA_DIR, TMP_DATA_DIR];

  for (const dir of dirs) {
    try {
      await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
      const target = resolveJsonPath(dir, fileName);
      await fs.writeFile(/*turbopackIgnore: true*/ target, serialized, "utf8");
      activeDataDir = dir;
      activeStorageBackend = dir === TMP_DATA_DIR ? "tmp_fallback" : "filesystem";
      return true;
    } catch {
      // Try fallback directory (e.g. /tmp on read-only serverless environments)
    }
  }

  activeStorageBackend = "memory";
  return false;
}

function createEmptyExperienceCohorts(): Record<ExperienceLevel, CohortCounter> {
  return {
    student: {
      cohortKey: "student",
      label: "Student / Fresher",
      variants: {
        brutal_checklist: { exposures: 0, rewriteCopies: 0 },
        guided_coach: { exposures: 0, rewriteCopies: 0 },
      },
    },
    mid: {
      cohortKey: "mid",
      label: "Mid-Level Engineer",
      variants: {
        brutal_checklist: { exposures: 0, rewriteCopies: 0 },
        guided_coach: { exposures: 0, rewriteCopies: 0 },
      },
    },
    senior: {
      cohortKey: "senior",
      label: "Senior / Staff",
      variants: {
        brutal_checklist: { exposures: 0, rewriteCopies: 0 },
        guided_coach: { exposures: 0, rewriteCopies: 0 },
      },
    },
  };
}

function createBaselineStore(): ExperimentStoreData {
  const now = Date.now();
  return {
    weights: {
      brutal_checklist: 50,
      guided_coach: 50,
    },
    unlockWeights: {
      instant_reveal: 50,
      interactive_step: 50,
    },
    scoreboardEnabled: true,
    variants: {
      brutal_checklist: {
        variant: "brutal_checklist",
        exposures: 48,
        completions: 45,
        rewriteCopies: 26,
        helpfulVotes: 19,
        ratingSum: 86,
        ratingCount: 20,
        totalTimeToCopyMs: 145600,
      },
      guided_coach: {
        variant: "guided_coach",
        exposures: 46,
        completions: 39,
        rewriteCopies: 17,
        helpfulVotes: 16,
        ratingSum: 74,
        ratingCount: 16,
        totalTimeToCopyMs: 210800,
      },
    },
    unlockVariants: {
      instant_reveal: { exposures: 47, rewriteCopies: 25 },
      interactive_step: { exposures: 47, rewriteCopies: 18 },
    },
    cohorts: {
      github_readme: {
        cohortKey: "github_readme",
        label: "GitHub READMEs",
        variants: {
          brutal_checklist: { exposures: 22, rewriteCopies: 13 },
          guided_coach: { exposures: 21, rewriteCopies: 7 },
        },
      },
      resume_bullets: {
        cohortKey: "resume_bullets",
        label: "Resume Bullets",
        variants: {
          brutal_checklist: { exposures: 18, rewriteCopies: 9 },
          guided_coach: { exposures: 18, rewriteCopies: 8 },
        },
      },
      project_pitch: {
        cohortKey: "project_pitch",
        label: "Project Pitches",
        variants: {
          brutal_checklist: { exposures: 8, rewriteCopies: 4 },
          guided_coach: { exposures: 7, rewriteCopies: 2 },
        },
      },
    },
    experienceCohorts: {
      student: {
        cohortKey: "student",
        label: "Student / Fresher",
        variants: {
          brutal_checklist: { exposures: 16, rewriteCopies: 7 },
          guided_coach: { exposures: 16, rewriteCopies: 9 },
        },
      },
      mid: {
        cohortKey: "mid",
        label: "Mid-Level Engineer",
        variants: {
          brutal_checklist: { exposures: 20, rewriteCopies: 12 },
          guided_coach: { exposures: 19, rewriteCopies: 6 },
        },
      },
      senior: {
        cohortKey: "senior",
        label: "Senior / Staff",
        variants: {
          brutal_checklist: { exposures: 12, rewriteCopies: 7 },
          guided_coach: { exposures: 11, rewriteCopies: 2 },
        },
      },
    },
    recentFeed: [
      {
        id: "seed-feed-1",
        timestamp: new Date(now - 180_000).toISOString(),
        inputType: "github_readme",
        experienceLevel: "mid",
        role: "Full-Stack Developer",
        variant: "brutal_checklist",
        unlockVariant: "instant_reveal",
        trafficSource: "simulated",
        score: 74,
        copiedRewrite: true,
        rating: 5,
      },
      {
        id: "seed-feed-2",
        timestamp: new Date(now - 95_000).toISOString(),
        inputType: "resume_bullets",
        experienceLevel: "student",
        role: "Backend Intern",
        variant: "guided_coach",
        unlockVariant: "interactive_step",
        trafficSource: "simulated",
        score: 61,
        copiedRewrite: true,
        rating: 4,
      },
    ],
  };
}

function createEmptyCleanStore(): ExperimentStoreData {
  return {
    weights: { brutal_checklist: 50, guided_coach: 50 },
    unlockWeights: { instant_reveal: 50, interactive_step: 50 },
    scoreboardEnabled: true,
    variants: {
      brutal_checklist: {
        variant: "brutal_checklist",
        exposures: 0,
        completions: 0,
        rewriteCopies: 0,
        helpfulVotes: 0,
        ratingSum: 0,
        ratingCount: 0,
        totalTimeToCopyMs: 0,
      },
      guided_coach: {
        variant: "guided_coach",
        exposures: 0,
        completions: 0,
        rewriteCopies: 0,
        helpfulVotes: 0,
        ratingSum: 0,
        ratingCount: 0,
        totalTimeToCopyMs: 0,
      },
    },
    unlockVariants: {
      instant_reveal: { exposures: 0, rewriteCopies: 0 },
      interactive_step: { exposures: 0, rewriteCopies: 0 },
    },
    cohorts: {
      github_readme: {
        cohortKey: "github_readme",
        label: "GitHub READMEs",
        variants: {
          brutal_checklist: { exposures: 0, rewriteCopies: 0 },
          guided_coach: { exposures: 0, rewriteCopies: 0 },
        },
      },
      resume_bullets: {
        cohortKey: "resume_bullets",
        label: "Resume Bullets",
        variants: {
          brutal_checklist: { exposures: 0, rewriteCopies: 0 },
          guided_coach: { exposures: 0, rewriteCopies: 0 },
        },
      },
      project_pitch: {
        cohortKey: "project_pitch",
        label: "Project Pitches",
        variants: {
          brutal_checklist: { exposures: 0, rewriteCopies: 0 },
          guided_coach: { exposures: 0, rewriteCopies: 0 },
        },
      },
    },
    experienceCohorts: createEmptyExperienceCohorts(),
    recentFeed: [],
  };
}

function normalizeExperimentStore(raw: ExperimentStoreData): ExperimentStoreData {
  const emptyExp = createEmptyExperienceCohorts();
  return {
    ...raw,
    unlockWeights: raw.unlockWeights ?? { instant_reveal: 50, interactive_step: 50 },
    unlockVariants: raw.unlockVariants ?? {
      instant_reveal: { exposures: 0, rewriteCopies: 0 },
      interactive_step: { exposures: 0, rewriteCopies: 0 },
    },
    experienceCohorts: {
      student: raw.experienceCohorts?.student ?? emptyExp.student,
      mid: raw.experienceCohorts?.mid ?? emptyExp.mid,
      senior: raw.experienceCohorts?.senior ?? emptyExp.senior,
    },
    recentFeed: Array.isArray(raw.recentFeed) ? raw.recentFeed : [],
  };
}

export async function readExperimentStore(): Promise<ExperimentStoreData> {
  if (memoryStoreCache && activeStorageBackend === "memory") {
    return normalizeExperimentStore(memoryStoreCache);
  }
  const disk = await readJsonFromDirs<ExperimentStoreData>("experiments.json");
  if (disk) {
    const normalized = normalizeExperimentStore(disk);
    memoryStoreCache = normalized;
    return normalized;
  }

  const initial = createBaselineStore();
  memoryStoreCache = initial;
  await writeJsonSafe("experiments.json", initial);
  return initial;
}

export async function writeExperimentStore(data: ExperimentStoreData): Promise<void> {
  const normalized = normalizeExperimentStore(data);
  memoryStoreCache = normalized;
  await writeJsonSafe("experiments.json", normalized);
}

export async function resetExperimentStore(
  mode: "baseline" | "zero" = "baseline"
): Promise<ExperimentStoreData> {
  return withExperimentLock(async () => {
    const data = mode === "zero" ? createEmptyCleanStore() : createBaselineStore();
    await writeExperimentStore(data);
    return data;
  });
}

export async function readRuntimeConfig(): Promise<RuntimeConfigInternal> {
  const saved =
    (activeStorageBackend === "memory" ? memoryConfigCache : null) ??
    (await readJsonFromDirs<Partial<RuntimeConfigInternal>>("config.json")) ??
    memoryConfigCache ??
    {};

  return {
    flagsmithApiUrl:
      saved.flagsmithApiUrl ||
      process.env.FLAGSMITH_API_URL ||
      "https://api.flagsmith.com",
    flagsmithSdkApiUrl:
      saved.flagsmithSdkApiUrl ||
      process.env.FLAGSMITH_SDK_API_URL ||
      "https://edge.api.flagsmith.com/api/v1/",
    publicFlagsmithEnvKey:
      saved.publicFlagsmithEnvKey ??
      process.env.NEXT_PUBLIC_FLAGSMITH_ENV_KEY ??
      "",
    flagsmithApiKey: saved.flagsmithApiKey ?? process.env.FLAGSMITH_API_KEY ?? "",
    flagsmithProjectId:
      saved.flagsmithProjectId ?? process.env.FLAGSMITH_PROJECT_ID ?? "",
    flagsmithEnvKey: saved.flagsmithEnvKey ?? process.env.FLAGSMITH_ENV_KEY ?? "",
    geminiApiKey: saved.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "",
    openaiApiKey: saved.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "",
    anthropicApiKey:
      saved.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
  };
}

export async function saveRuntimeConfig(
  patch: Partial<RuntimeConfigInternal>
): Promise<RuntimeConfigInternal> {
  return withExperimentLock(async () => {
    const existing =
      (await readJsonFromDirs<Partial<RuntimeConfigInternal>>("config.json")) ??
      memoryConfigCache ??
      {};
    const merged: Partial<RuntimeConfigInternal> = { ...existing };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (merged as Record<string, string>)[k] = v;
      }
    }
    memoryConfigCache = merged;
    await writeJsonSafe("config.json", merged);
    return readRuntimeConfig();
  });
}

export function getPublicConnectionStatus(
  cfg: RuntimeConfigInternal
): ConnectionStatusPublic {
  const hasGeminiKey = Boolean(cfg.geminiApiKey.trim());
  const hasOpenAiKey = Boolean(cfg.openaiApiKey.trim());
  const hasAnthropicKey = Boolean(cfg.anthropicApiKey.trim());

  const activeLlmProvider = hasGeminiKey
    ? "gemini"
    : hasOpenAiKey
      ? "openai"
      : hasAnthropicKey
        ? "anthropic"
        : "rubric";

  return {
    mode: cfg.publicFlagsmithEnvKey.trim()
      ? "live_flagsmith"
      : "local_experiment_mode",
    publicFlagsmithEnvKey: cfg.publicFlagsmithEnvKey.trim(),
    flagsmithApiUrl: cfg.flagsmithApiUrl,
    flagsmithProjectId: cfg.flagsmithProjectId,
    hasManagementKey: Boolean(
      cfg.flagsmithApiKey.trim() && cfg.flagsmithProjectId.trim()
    ),
    hasGeminiKey,
    hasOpenAiKey,
    hasAnthropicKey,
    activeLlmProvider,
    storageBackend: activeStorageBackend,
  };
}

function deterministicBucket(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function assignStrategyForVisitor(
  visitorId: string,
  weights: Record<RoastStrategyVariant, number>
): RoastStrategyVariant {
  const total = weights.brutal_checklist + weights.guided_coach;
  if (total <= 0) return "brutal_checklist";
  const bucket = (deterministicBucket(`roast_strategy:${visitorId}`) / 100) * total;
  return bucket < weights.brutal_checklist ? "brutal_checklist" : "guided_coach";
}

export function assignUnlockFlowForVisitor(
  visitorId: string,
  weights: Record<UnlockFlowVariant, number>
): UnlockFlowVariant {
  const total = weights.instant_reveal + weights.interactive_step;
  if (total <= 0) return "instant_reveal";
  const bucket = (deterministicBucket(`unlock_flow:${visitorId}`) / 100) * total;
  return bucket < weights.instant_reveal ? "instant_reveal" : "interactive_step";
}

/**
 * Generates an authentic `@flagsmith/flagsmith` IState payload so `FlagsmithProvider`,
 * `useFlags`, and `useExperiment` work identically in both live Flagsmith Cloud and
 * zero-key local experimentation mode.
 */
export function buildFlagsmithSdkState(params: {
  visitorId: string;
  traits?: Partial<VisitorTraits>;
  store: ExperimentStoreData;
  sdkApiUrl: string;
}): IState {
  const strategy = assignStrategyForVisitor(params.visitorId, params.store.weights);
  const unlock = assignUnlockFlowForVisitor(
    params.visitorId,
    params.store.unlockWeights
  );

  return {
    api: params.sdkApiUrl,
    identity: params.visitorId,
    flags: {
      roast_strategy_experiment: {
        id: 201,
        enabled: true,
        value: strategy,
        variant: strategy,
        experiment: {
          id: 1,
          name: "DevRoast Strategy A/B",
          inExperiment: true,
        },
      },
      rewrite_unlock_flow: {
        id: 202,
        enabled: true,
        value: unlock,
        variant: unlock,
        experiment: {
          id: 2,
          name: "Rewrite Unlock Flow A/B",
          inExperiment: true,
        },
      },
      live_scoreboard_enabled: {
        id: 203,
        enabled: params.store.scoreboardEnabled,
        value: params.store.scoreboardEnabled ? "visible" : "hidden",
      },
    },
    evaluationContext: {
      identity: {
        identifier: params.visitorId,
        traits: {
          role: { value: params.traits?.role ?? "Full-Stack Developer" },
          experience_level: { value: params.traits?.experience_level ?? "mid" },
          input_type: { value: params.traits?.input_type ?? "github_readme" },
        },
      },
    },
    ts: Date.now(),
  };
}

/**
 * Provisions the 3 Flagsmith flags directly inside the user's Flagsmith Cloud project
 * via Management REST API, reporting created, existing, and error details accurately.
 */
export async function provisionFlagsInFlagsmithCloud(
  cfg: RuntimeConfigInternal
): Promise<{
  created: string[];
  skippedOrExisting: string[];
  errors: Array<{ name: string; message: string }>;
}> {
  if (!cfg.flagsmithApiKey.trim() || !cfg.flagsmithProjectId.trim()) {
    throw new Error("Flagsmith Management API key and Project ID are required.");
  }

  const base = cfg.flagsmithApiUrl.replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Api-Key ${cfg.flagsmithApiKey.trim()}`,
  };

  const specs = [
    {
      name: "roast_strategy_experiment",
      type: "MULTIVARIATE",
      description:
        "Toggle Wars Track 01 A/B Test: brutal_checklist (50%) vs guided_coach (50%)",
      default_enabled: true,
      initial_value: "brutal_checklist",
      multivariate_options: [
        {
          type: "unicode",
          string_value: "brutal_checklist",
          default_percentage_allocation: 50,
        },
        {
          type: "unicode",
          string_value: "guided_coach",
          default_percentage_allocation: 50,
        },
      ],
    },
    {
      name: "rewrite_unlock_flow",
      type: "MULTIVARIATE",
      description:
        "Secondary A/B test comparing instant_reveal vs interactive_step rewrite unlock",
      default_enabled: true,
      initial_value: "instant_reveal",
      multivariate_options: [
        {
          type: "unicode",
          string_value: "instant_reveal",
          default_percentage_allocation: 50,
        },
        {
          type: "unicode",
          string_value: "interactive_step",
          default_percentage_allocation: 50,
        },
      ],
    },
    {
      name: "live_scoreboard_enabled",
      type: "STANDARD",
      description:
        "Controls visibility of the public Toggle Wars experiment scoreboard",
      default_enabled: true,
      initial_value: "visible",
    },
  ];

  const created: string[] = [];
  const skippedOrExisting: string[] = [];
  const errors: Array<{ name: string; message: string }> = [];

  for (const spec of specs) {
    const res = await fetch(
      `${base}/api/v1/projects/${encodeURIComponent(cfg.flagsmithProjectId.trim())}/features/`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(spec),
      }
    );
    if (res.ok) {
      created.push(spec.name);
      continue;
    }

    const detailText = await res.text().catch(() => "");
    if (
      res.status === 409 ||
      /already exists|unique/i.test(detailText)
    ) {
      skippedOrExisting.push(spec.name);
    } else {
      errors.push({
        name: spec.name,
        message: `HTTP ${res.status}: ${detailText.slice(0, 160) || res.statusText}`,
      });
    }
  }

  return { created, skippedOrExisting, errors };
}

export { getStoreFile, getConfigFile };
