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

import { isAdminProtected } from "@/lib/auth/adminGuard";

const PRIMARY_DATA_DIR = path.join(process.cwd(), ".devroast");
const TMP_DATA_DIR = path.join(os.tmpdir(), "devroast-lab");
const REDIS_KEYS = {
  "experiments.json": "devroast:experiments:v1",
  "config.json": "devroast:config:v1",
} as const;

let activeDataDir = PRIMARY_DATA_DIR;
let activeStorageBackend: "upstash_redis" | "filesystem" | "tmp_fallback" | "memory" =
  "filesystem";
let memoryStoreCache: ExperimentStoreData | null = null;
let memoryConfigCache: Partial<RuntimeConfigInternal> | null = null;

function getRedisCredentials(): { url: string; token: string } | null {
  const url = (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    memoryConfigCache?.upstashRedisRestUrl ||
    ""
  ).trim();
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    memoryConfigCache?.upstashRedisRestToken ||
    ""
  ).trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

async function readFromRedis<T>(
  fileName: "experiments.json" | "config.json"
): Promise<T | null> {
  const creds = getRedisCredentials();
  if (!creds) return null;
  try {
    const res = await fetch(creds.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.token}`,
      },
      body: JSON.stringify(["GET", REDIS_KEYS[fileName]]),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data.result) return null;
    activeStorageBackend = "upstash_redis";
    return JSON.parse(data.result) as T;
  } catch {
    return null;
  }
}

async function writeToRedis(
  fileName: "experiments.json" | "config.json",
  serialized: string
): Promise<boolean> {
  const creds = getRedisCredentials();
  if (!creds) return false;
  try {
    const res = await fetch(creds.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.token}`,
      },
      body: JSON.stringify(["SET", REDIS_KEYS[fileName], serialized]),
      cache: "no-store",
    });
    if (!res.ok) return false;
    activeStorageBackend = "upstash_redis";
    return true;
  } catch {
    return false;
  }
}

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
  const fromRedis = await readFromRedis<T>(fileName);
  if (fromRedis) return fromRedis;

  for (const dir of [activeDataDir, PRIMARY_DATA_DIR, TMP_DATA_DIR]) {
    try {
      const target = resolveJsonPath(dir, fileName);
      const raw = await fs.readFile(/*turbopackIgnore: true*/ target, "utf8");
      if (getRedisCredentials()) {
        activeStorageBackend = "upstash_redis";
      } else {
        activeStorageBackend = dir === TMP_DATA_DIR ? "tmp_fallback" : "filesystem";
      }
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
  const wroteRedis = await writeToRedis(fileName, serialized);

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
      activeStorageBackend = wroteRedis
        ? "upstash_redis"
        : dir === TMP_DATA_DIR
          ? "tmp_fallback"
          : "filesystem";
      return true;
    } catch {
      // Try fallback directory (e.g. /tmp on read-only serverless environments)
    }
  }

  activeStorageBackend = wroteRedis ? "upstash_redis" : "memory";
  return wroteRedis;
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
  if (getRedisCredentials()) {
    const fromRedis = await readFromRedis<ExperimentStoreData>("experiments.json");
    if (fromRedis) {
      const normalized = normalizeExperimentStore(fromRedis);
      memoryStoreCache = normalized;
      return normalized;
    }
  } else if (memoryStoreCache && activeStorageBackend === "memory") {
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
    upstashRedisRestUrl:
      saved.upstashRedisRestUrl ??
      process.env.UPSTASH_REDIS_REST_URL ??
      process.env.KV_REST_API_URL ??
      "",
    upstashRedisRestToken:
      saved.upstashRedisRestToken ??
      process.env.UPSTASH_REDIS_REST_TOKEN ??
      process.env.KV_REST_API_TOKEN ??
      "",
    adminKey: process.env.DEVROAST_ADMIN_KEY ?? "",
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
    storageBackend: getRedisCredentials() ? "upstash_redis" : activeStorageBackend,
    adminProtected: isAdminProtected(),
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

interface RemoteProjectFeatureLite {
  id: number;
  name: string;
  multivariate_options?: Array<{
    id: number;
    string_value?: string | null;
  }>;
}

interface RemoteFeatureStateLite {
  id: number;
  feature: number;
  enabled: boolean;
  feature_state_value?: unknown;
  feature_segment?: { id: number; segment: number; priority: number } | null;
  multivariate_feature_state_values?: Array<{
    id?: number;
    multivariate_feature_option: number;
    percentage_allocation: number;
  }>;
}

async function resolveFlagsmithEnvContext(
  cfg: RuntimeConfigInternal,
  featureName: string
): Promise<{
  base: string;
  headers: Record<string, string>;
  envKey: string;
  envId: number;
  useV2: boolean;
  feature: RemoteProjectFeatureLite;
  states: RemoteFeatureStateLite[];
}> {
  const envKey = (cfg.flagsmithEnvKey || cfg.publicFlagsmithEnvKey).trim();
  if (!cfg.flagsmithApiKey.trim() || !cfg.flagsmithProjectId.trim() || !envKey) {
    throw new Error("Flagsmith Management API key, Project ID, and Env Key are required.");
  }

  const base = cfg.flagsmithApiUrl.replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Api-Key ${cfg.flagsmithApiKey.trim()}`,
  };

  const [envRes, featRes] = await Promise.all([
    fetch(`${base}/api/v1/environments/${encodeURIComponent(envKey)}/`, {
      headers,
      cache: "no-store",
    }),
    fetch(
      `${base}/api/v1/projects/${encodeURIComponent(cfg.flagsmithProjectId.trim())}/features/`,
      { headers, cache: "no-store" }
    ),
  ]);

  if (!envRes.ok || !featRes.ok) {
    throw new Error(`Flagsmith lookup failed (${envRes.status}/${featRes.status})`);
  }

  const envJson = (await envRes.json()) as {
    id: number;
    use_v2_feature_versioning?: boolean;
  };
  const featPayload = (await featRes.json()) as
    | RemoteProjectFeatureLite[]
    | { results: RemoteProjectFeatureLite[] };
  const features = Array.isArray(featPayload)
    ? featPayload
    : featPayload.results ?? [];
  const feature = features.find((f) => f.name === featureName);
  if (!feature) {
    throw new Error(`Feature "${featureName}" not found in Flagsmith project.`);
  }

  let states: RemoteFeatureStateLite[] = [];
  if (envJson.use_v2_feature_versioning) {
    const verRes = await fetch(
      `${base}/api/v1/environments/${envJson.id}/features/${feature.id}/versions/`,
      { headers, cache: "no-store" }
    );
    if (verRes.ok) {
      const verJson = (await verRes.json()) as {
        results?: Array<{ uuid: string; is_live?: boolean }>;
      };
      const liveVer =
        verJson.results?.find((v) => v.is_live) ?? verJson.results?.[0];
      if (liveVer?.uuid) {
        const fsRes = await fetch(
          `${base}/api/v1/environments/${envJson.id}/features/${feature.id}/versions/${liveVer.uuid}/featurestates/`,
          { headers, cache: "no-store" }
        );
        if (fsRes.ok) {
          states = (await fsRes.json()) as RemoteFeatureStateLite[];
        }
      }
    }
  } else {
    const fsRes = await fetch(
      `${base}/api/v1/environments/${encodeURIComponent(envKey)}/featurestates/`,
      { headers, cache: "no-store" }
    );
    if (fsRes.ok) {
      const all = (await fsRes.json()) as
        | RemoteFeatureStateLite[]
        | { results: RemoteFeatureStateLite[] };
      const list = Array.isArray(all) ? all : all.results ?? [];
      states = list.filter((s) => s.feature === feature.id);
    }
  }

  return {
    base,
    headers,
    envKey,
    envId: envJson.id,
    useV2: Boolean(envJson.use_v2_feature_versioning),
    feature,
    states,
  };
}

async function applyFlagsmithStateUpdates(
  ctx: Awaited<ReturnType<typeof resolveFlagsmithEnvContext>>,
  updates: Array<{
    id: number;
    enabled: boolean;
    feature_state_value?: unknown;
    feature_segment?: number | null;
    multivariate_feature_state_values?: Array<{
      multivariate_feature_option: number;
      percentage_allocation: number;
    }>;
  }>
): Promise<{ synced: boolean; message: string }> {
  if (updates.length === 0) {
    return { synced: false, message: "No matching Flagsmith feature state rows found." };
  }

  if (ctx.useV2) {
    const res = await fetch(
      `${ctx.base}/api/v1/environments/${ctx.envId}/features/${ctx.feature.id}/versions/`,
      {
        method: "POST",
        headers: ctx.headers,
        body: JSON.stringify({
          publish_immediately: true,
          feature_states_to_update: updates.map((u) => ({
            enabled: u.enabled,
            feature_state_value: u.feature_state_value,
            ...(u.feature_segment !== undefined
              ? { feature_segment: u.feature_segment }
              : {}),
            ...(u.multivariate_feature_state_values
              ? { multivariate_feature_state_values: u.multivariate_feature_state_values }
              : {}),
          })),
        }),
      }
    );
    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      return {
        synced: false,
        message: `Flagsmith v2 publish HTTP ${res.status}: ${errTxt.slice(0, 140)}`,
      };
    }
    return { synced: true, message: "Published live version to Flagsmith Cloud (v2)." };
  }

  for (const u of updates) {
    const res = await fetch(
      `${ctx.base}/api/v1/environments/${encodeURIComponent(ctx.envKey)}/featurestates/${u.id}/`,
      {
        method: "PATCH",
        headers: ctx.headers,
        body: JSON.stringify({
          enabled: u.enabled,
          ...(u.multivariate_feature_state_values
            ? { multivariate_feature_state_values: u.multivariate_feature_state_values }
            : {}),
        }),
      }
    );
    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      return {
        synced: false,
        message: `Flagsmith PATCH HTTP ${res.status}: ${errTxt.slice(0, 140)}`,
      };
    }
  }
  return { synced: true, message: "Updated Flagsmith Cloud feature state." };
}

export async function syncRoastWeightsToFlagsmithCloud(
  cfg: RuntimeConfigInternal,
  brutalWeight: number
): Promise<{ synced: boolean; message: string }> {
  if (!cfg.flagsmithApiKey.trim() || !cfg.flagsmithProjectId.trim()) {
    return { synced: false, message: "Local split updated (Flagsmith Management key not set)." };
  }
  try {
    const ctx = await resolveFlagsmithEnvContext(cfg, "roast_strategy_experiment");
    const brutalOpt = ctx.feature.multivariate_options?.find(
      (o) => o.string_value === "brutal_checklist"
    );
    const coachOpt = ctx.feature.multivariate_options?.find(
      (o) => o.string_value === "guided_coach"
    );
    if (!brutalOpt || !coachOpt) {
      return { synced: false, message: "Multivariate options not found on Flagsmith Cloud." };
    }

    const mvPayload = [
      { multivariate_feature_option: brutalOpt.id, percentage_allocation: brutalWeight },
      { multivariate_feature_option: coachOpt.id, percentage_allocation: 100 - brutalWeight },
    ];

    const defaultState = ctx.states.find((s) => !s.feature_segment) ?? ctx.states[0];
    if (!defaultState) {
      return { synced: false, message: "No default feature state found in Flagsmith." };
    }

    return await applyFlagsmithStateUpdates(ctx, [
      {
        id: defaultState.id,
        enabled: true,
        feature_state_value: defaultState.feature_state_value,
        feature_segment: null,
        multivariate_feature_state_values: mvPayload,
      },
    ]);
  } catch (err) {
    return {
      synced: false,
      message: err instanceof Error ? err.message : "Flagsmith weight sync failed.",
    };
  }
}

export async function syncScoreboardEnabledToFlagsmithCloud(
  cfg: RuntimeConfigInternal,
  enabled: boolean
): Promise<{ synced: boolean; message: string }> {
  if (!cfg.flagsmithApiKey.trim() || !cfg.flagsmithProjectId.trim()) {
    return { synced: false, message: "Local flag updated (Flagsmith Management key not set)." };
  }
  try {
    const ctx = await resolveFlagsmithEnvContext(cfg, "live_scoreboard_enabled");
    const defaultState = ctx.states.find((s) => !s.feature_segment) ?? ctx.states[0];
    if (!defaultState) {
      return { synced: false, message: "No default feature state found in Flagsmith." };
    }
    return await applyFlagsmithStateUpdates(ctx, [
      {
        id: defaultState.id,
        enabled,
        feature_state_value: defaultState.feature_state_value,
        feature_segment: null,
      },
    ]);
  } catch (err) {
    return {
      synced: false,
      message: err instanceof Error ? err.message : "Flagsmith toggle sync failed.",
    };
  }
}

export { getStoreFile, getConfigFile };
