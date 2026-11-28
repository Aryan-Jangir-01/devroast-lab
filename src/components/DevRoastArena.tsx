"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createFlagsmithInstance } from "@flagsmith/flagsmith/isomorphic";
import {
  FlagsmithProvider,
  useFlags,
  useFlagsmith,
} from "@flagsmith/flagsmith/react";
import type { IState } from "@flagsmith/flagsmith/types";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ClipboardCopy,
  FileCode2,
  Flame,
  GitBranch,
  Loader2,
  RefreshCw,
  Settings,
  Share2,
  Sparkles,
  Star,
} from "lucide-react";
import { ConnectFlagsmithModal } from "@/components/ConnectFlagsmithModal";
import { FlagsmithInspector } from "@/components/FlagsmithInspector";
import { buildAdminHeaders } from "@/lib/auth/clientAdmin";
import type {
  BayesianScoreboard,
  ConnectionStatusPublic,
  ExperienceLevel,
  FlagsmithEventLogEntry,
  InputType,
  RoastAnalysisResult,
  RoastStrategyVariant,
  UnlockFlowVariant,
} from "@/lib/types";

const VISITOR_STORAGE_KEY = "devroast_visitor_id";

const SAMPLES: Record<InputType, string> = {
  github_readme: `# TaskSync CLI
A tool I made for syncing tasks between Notion and GitHub.
I worked on this project using Node.js and TypeScript. It helps developers manage issues faster without switching tabs.
Features:
- Sync tasks
- Easy to use
- Fast`,
  resume_bullets: `- Worked on backend APIs for an e-commerce web app using Node.js and MongoDB
- Helped with frontend UI improvements in React and fixed various bugs
- Responsible for deploying the project on AWS and managing database backups`,
  project_pitch: `We built an AI study assistant app for college students that summarizes notes and creates quizzes automatically so students can prepare faster before exams.`,
};

interface StateApiResponse {
  connection: ConnectionStatusPublic;
  scoreboard: BayesianScoreboard;
  sdkState: IState;
}

interface ArenaInnerProps {
  connection: ConnectionStatusPublic;
  scoreboard: BayesianScoreboard;
  visitorId: string;
  onRotateVisitor: () => void;
  onOpenSettings: () => void;
  onOpenInspector: () => void;
  sdkLogs: FlagsmithEventLogEntry[];
  onLogSdkEvent: (
    kind: FlagsmithEventLogEntry["kind"],
    name: string,
    detail: string,
    payload: Record<string, unknown>
  ) => void;
  inputType: InputType;
  onInputTypeChange: (t: InputType) => void;
  role: string;
  onRoleChange: (r: string) => void;
  experienceLevel: ExperienceLevel;
  onExperienceLevelChange: (lvl: ExperienceLevel) => void;
  onRefreshState: () => Promise<void>;
  inspectorOpen: boolean;
  onCloseInspector: () => void;
  onClearLogs: () => void;
}

function buildPersonalizedRewrite(
  baseRewrite: string,
  inputType: InputType,
  coachInputs: Record<number, { chip?: string; note?: string }>
): string {
  const hookNote = coachInputs[1]?.note?.trim() || coachInputs[1]?.chip?.trim();
  const metricNote = coachInputs[2]?.note?.trim() || coachInputs[2]?.chip?.trim();
  const actionNote = coachInputs[3]?.note?.trim() || coachInputs[3]?.chip?.trim();

  if (!hookNote && !metricNote && !actionNote) return baseRewrite;

  const extras: string[] = [];
  if (hookNote) extras.push(`Hook Focus: ${hookNote}`);
  if (metricNote) extras.push(`Verified Proof: ${metricNote}`);
  if (actionNote) extras.push(`Actionability Callout: ${actionNote}`);

  if (inputType === "github_readme") {
    return `${baseRewrite}\n\n## Coaching Calibration Highlights\n${extras
      .map((line) => `- ${line}`)
      .join("\n")}`;
  }
  if (inputType === "resume_bullets") {
    return `${baseRewrite}\n• Impact Highlight (${hookNote || "Core System"}): Achieved ${metricNote || "measurable reliability gains"} — ${actionNote || "verified in production"}.`;
  }
  return `${baseRewrite} (${extras.join(" · ")})`;
}

function ArenaInner({
  connection,
  scoreboard,
  visitorId,
  onRotateVisitor,
  onOpenSettings,
  onOpenInspector,
  sdkLogs,
  onLogSdkEvent,
  inputType,
  onInputTypeChange,
  role,
  onRoleChange,
  experienceLevel,
  onExperienceLevelChange,
  onRefreshState,
  inspectorOpen,
  onCloseInspector,
  onClearLogs,
}: ArenaInnerProps) {
  const flagsmith = useFlagsmith();
  const flags = useFlags([
    "roast_strategy_experiment",
    "rewrite_unlock_flow",
    "live_scoreboard_enabled",
  ]);

  const rawStrategy = String(
    flags.roast_strategy_experiment?.value ?? "brutal_checklist"
  );
  const strategyVariant: RoastStrategyVariant =
    rawStrategy === "guided_coach" ? "guided_coach" : "brutal_checklist";

  const rawUnlock = String(flags.rewrite_unlock_flow?.value ?? "instant_reveal");
  const unlockVariant: UnlockFlowVariant =
    rawUnlock === "interactive_step" ? "interactive_step" : "instant_reveal";

  const showScoreboardLink = flags.live_scoreboard_enabled?.enabled ?? true;

  const [text, setText] = useState(SAMPLES.github_readme);
  const [githubUrl, setGithubUrl] = useState("");
  const [fetchingRepo, setFetchingRepo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RoastAnalysisResult | null>(null);
  const [feedId, setFeedId] = useState<string | null>(null);
  const [coachStep, setCoachStep] = useState(1);
  const [coachUnlocked, setCoachUnlocked] = useState(false);
  const [coachInputs, setCoachInputs] = useState<
    Record<number, { chip?: string; note?: string }>
  >({});
  const [checkedFixes, setCheckedFixes] = useState<Record<number, boolean>>({});
  const [outputView, setOutputView] = useState<"upgraded" | "diff">("upgraded");
  const [copied, setCopied] = useState(false);
  const [sharedCard, setSharedCard] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const resultRenderedAtRef = useRef<number>(0);

  const handleLoadSample = (nextType: InputType) => {
    onInputTypeChange(nextType);
    setText(SAMPLES[nextType]);
    setAnalysis(null);
    setError(null);
    setCheckedFixes({});
    setCoachInputs({});
  };

  const handleFetchGithubReadme = async () => {
    if (!githubUrl.trim()) return;
    setFetchingRepo(true);
    setError(null);
    try {
      const res = await fetch("/api/github-readme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: githubUrl.trim() }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        content?: string;
        owner?: string;
        repo?: string;
        error?: string;
      };
      if (!res.ok || !json.content) {
        throw new Error(json.error || "Could not fetch README.md");
      }
      setText(json.content);
      setAnalysis(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub fetch failed");
    } finally {
      setFetchingRepo(false);
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    setSharedCard(false);
    setRating(null);
    setCoachStep(1);
    setCoachInputs({});
    setCheckedFixes({});
    setOutputView("upgraded");
    setCoachUnlocked(
      strategyVariant === "brutal_checklist" && unlockVariant === "instant_reveal"
    );

    try {
      const expStrategy = flagsmith.eventsEnabled
        ? flagsmith.getExperimentFlag("roast_strategy_experiment")
        : flags.roast_strategy_experiment;
      const expUnlock = flagsmith.eventsEnabled
        ? flagsmith.getExperimentFlag("rewrite_unlock_flow")
        : flags.rewrite_unlock_flow;

      const strategyExpId = expStrategy?.experiment?.id;
      const unlockExpId = expUnlock?.experiment?.id;

      const strategyExposurePayload = {
        identifier: visitorId,
        variant: expStrategy?.variant ?? null,
        value: expStrategy?.variant ?? strategyVariant,
        featureValue: strategyVariant,
        metadata: {
          ...(strategyExpId ? { experiment_id: strategyExpId } : {}),
          inputType,
          experienceLevel,
        },
      };
      const unlockExposurePayload = {
        identifier: visitorId,
        variant: expUnlock?.variant ?? null,
        value: expUnlock?.variant ?? unlockVariant,
        featureValue: unlockVariant,
        metadata: {
          ...(unlockExpId ? { experiment_id: unlockExpId } : {}),
          inputType,
          strategyVariant,
        },
      };

      // Note: getExperimentFlag() automatically calls trackExposureEvent with `variant`
      // when loaded from Flagsmith Server. For non-experiment flags or local fallback,
      // log the resolved exposure state cleanly.
      if (flagsmith.eventsEnabled && !expStrategy?.experiment?.inExperiment) {
        flagsmith.trackExposureEvent("roast_strategy_experiment", {
          identifier: visitorId,
          value: expStrategy?.variant ?? strategyVariant,
          metadata: { inputType, experienceLevel },
        });
      }
      if (flagsmith.eventsEnabled && !expUnlock?.experiment?.inExperiment) {
        flagsmith.trackExposureEvent("rewrite_unlock_flow", {
          identifier: visitorId,
          value: expUnlock?.variant ?? unlockVariant,
          metadata: { inputType, strategyVariant },
        });
      }

      onLogSdkEvent(
        "exposure",
        "$flag_exposure · roast_strategy_experiment",
        `Bucketed visitor into "${strategyVariant}" (variant=${String(expStrategy?.variant ?? "unset")})`,
        strategyExposurePayload
      );
      onLogSdkEvent(
        "exposure",
        "$flag_exposure · rewrite_unlock_flow",
        `Unlock flow assigned "${unlockVariant}"`,
        unlockExposurePayload
      );

      const res = await fetch("/api/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          inputType,
          role,
          experienceLevel,
          variant: strategyVariant,
          unlockVariant,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        feedId?: string;
        analysis?: RoastAnalysisResult;
        error?: string;
      };
      if (!res.ok || !json.analysis) {
        throw new Error(json.error || "Roast analysis failed");
      }

      setAnalysis(json.analysis);
      setFeedId(json.feedId ?? null);
      resultRenderedAtRef.current = Date.now();

      const completionPayload = {
        identifier: visitorId,
        value: json.analysis.overallScore,
        metadata: { variant: strategyVariant, unlockVariant, inputType },
      };
      if (flagsmith.eventsEnabled) {
        flagsmith.trackEvent("roast_completed", completionPayload);
        void flagsmith.flushEvents();
      }
      onLogSdkEvent(
        "track",
        "roast_completed",
        `Scored ${json.analysis.overallScore}/100 via ${json.analysis.engineSource}`,
        completionPayload
      );

      await onRefreshState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    void runAnalysis();
  };

  const isGuided = strategyVariant === "guided_coach";

  const displayedRewrite = useMemo(() => {
    if (!analysis) return "";
    return isGuided
      ? buildPersonalizedRewrite(analysis.rewrittenText, inputType, coachInputs)
      : analysis.rewrittenText;
  }, [analysis, isGuided, inputType, coachInputs]);

  const handleCopyRewrite = async () => {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(displayedRewrite);
    } catch {
      // Clipboard may be restricted in headless contexts
    }
    setCopied(true);
    const elapsedMs = resultRenderedAtRef.current
      ? Math.max(800, Date.now() - resultRenderedAtRef.current)
      : 4200;

    const copyPayload = {
      identifier: visitorId,
      value: elapsedMs,
      metadata: { variant: strategyVariant, unlockVariant, inputType },
    };

    if (flagsmith.eventsEnabled) {
      flagsmith.trackEvent("rewrite_copied", copyPayload);
      void flagsmith.flushEvents();
    }
    onLogSdkEvent(
      "track",
      "rewrite_copied (Primary KPI)",
      `Converted in ${(elapsedMs / 1000).toFixed(1)}s on "${strategyVariant}"`,
      copyPayload
    );

    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "track",
        eventType: "rewrite_copied",
        variant: strategyVariant,
        unlockVariant,
        inputType,
        feedId,
        timeToCopyMs: elapsedMs,
      }),
    });
    await onRefreshState();
  };

  const handleCopyShareCard = async () => {
    if (!analysis) return;
    const card = [
      `## DevRoast Lab Scorecard — ${analysis.overallScore}/100 (${analysis.verdictBadge})`,
      `**Flagsmith Variant:** \`${strategyVariant}\` · **Target:** ${role} (${experienceLevel})`,
      `**Headline:** ${analysis.roastHeadline}`,
      ``,
      `### Top Fixes`,
      ...analysis.checklistFixes.map((f) => `- [ ] ${f}`),
      ``,
      `### Upgraded Copy`,
      "```markdown",
      displayedRewrite,
      "```",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(card);
    } catch {
      // Headless fallback
    }
    setSharedCard(true);
    setTimeout(() => setSharedCard(false), 2500);
  };

  const handleRate = async (stars: number) => {
    setRating(stars);
    const ratePayload = {
      identifier: visitorId,
      value: stars,
      metadata: { variant: strategyVariant, inputType },
    };
    if (flagsmith.eventsEnabled) {
      flagsmith.trackEvent("feedback_helpful", ratePayload);
      void flagsmith.flushEvents();
    }
    onLogSdkEvent(
      "track",
      "feedback_helpful",
      `User rated ${stars}/5 stars`,
      ratePayload
    );

    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "track",
        eventType: "feedback_helpful",
        variant: strategyVariant,
        inputType,
        feedId,
        rating: stars,
      }),
    });
    await onRefreshState();
  };

  const handleFlushSdkNow = async () => {
    if (flagsmith.eventsEnabled) {
      await flagsmith.flushEvents();
    }
    onLogSdkEvent(
      "flush",
      "flagsmith.flushEvents()",
      flagsmith.eventsEnabled
        ? "Flushed buffered experimentation events to Flagsmith Events API"
        : "Local mode active — events persisted directly to DevRoast store",
      { eventsEnabled: flagsmith.eventsEnabled, identity: visitorId }
    );
  };

  const rewriteVisible = !isGuided
    ? unlockVariant === "instant_reveal" || coachUnlocked
    : coachUnlocked;

  const checkedCount = Object.values(checkedFixes).filter(Boolean).length;
  const projectedScore = analysis
    ? Math.min(99, analysis.overallScore + checkedCount * 4)
    : 0;

  const wordCount = useMemo(
    () => text.trim().split(/\s+/).filter(Boolean).length,
    [text]
  );
  const lineCount = useMemo(
    () => (text.trim() ? text.trim().split(/\r?\n/).length : 0),
    [text]
  );

  const allFlags = flagsmith.getAllFlags() || {};
  const flagsSnapshot = [
    "roast_strategy_experiment",
    "rewrite_unlock_flow",
    "live_scoreboard_enabled",
  ].map((key) => {
    const f = allFlags[key];
    return {
      key,
      enabled: Boolean(f?.enabled ?? true),
      value: String(f?.value ?? ""),
      variant: f?.variant ?? null,
      inExperiment: Boolean(f?.experiment?.inExperiment),
    };
  });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Crisp Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#09090b]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f5c518] text-black">
              <Flame className="h-4 w-4 stroke-[2.25]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-zinc-50">
                  DevRoast Lab
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-[#111115] px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      connection.mode === "live_flagsmith"
                        ? "bg-[#f5c518]"
                        : "bg-zinc-500"
                    }`}
                  />
                  {connection.mode === "live_flagsmith"
                    ? "Live Flagsmith Edge"
                    : "Local Mode"}
                </span>
                <span className="rounded border border-[#f5c518]/35 bg-[#f5c518]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#f5c518]">
                  {strategyVariant}
                </span>
              </div>
              <p className="hidden md:block text-[11px] text-zinc-500">
                Toggle Wars Track 01 · Experimenting Brutal Checklist vs Guided Coach
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRotateVisitor}
              title="Rotate Flagsmith visitor identity to test deterministic A/B bucketing"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#111115] hover:border-zinc-700 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 hover:text-zinc-50 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3 text-[#f5c518]" />
              <span className="hidden sm:inline">{visitorId}</span>
              <span className="sm:hidden">Visitor</span>
            </button>

            <button
              type="button"
              onClick={onOpenInspector}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#111115] hover:border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-200 cursor-pointer"
            >
              <Activity className="h-3.5 w-3.5 text-[#f5c518]" />
              <span className="hidden sm:inline">SDK Inspector</span>
              <span className="font-mono text-[10px] text-zinc-400">
                ({sdkLogs.length})
              </span>
            </button>

            {showScoreboardLink && (
              <Link
                href="/scoreboard"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#f5c518]/40 bg-[#f5c518]/10 hover:bg-[#f5c518]/20 px-2.5 py-1.5 text-xs font-semibold text-[#f5c518]"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Scoreboard</span>
                <span className="font-mono text-[10px] tabular-nums">
                  {scoreboard.totalExposures}
                </span>
              </Link>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Flagsmith Setup"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#111115] hover:border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-50 cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden md:inline">Setup</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 grid lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Input Workbench */}
        <section className="lg:col-span-5 rounded-xl border border-zinc-800 bg-[#111115] overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-100">
              Source Draft
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Paste a README, resume bullets, or pitch — traits route directly to Flagsmith.
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* Segmented Control */}
            <div className="grid grid-cols-3 rounded-lg border border-zinc-800 bg-[#09090b] p-1 gap-1">
              {(
                [
                  { id: "github_readme", label: "GitHub README" },
                  { id: "resume_bullets", label: "Resume Bullets" },
                  { id: "project_pitch", label: "Project Pitch" },
                ] as const
              ).map((tab) => {
                const active = inputType === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleLoadSample(tab.id)}
                    className={`rounded-md py-1.5 px-2 text-xs transition cursor-pointer ${
                      active
                        ? "bg-[#f5c518] text-black font-semibold"
                        : "text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {inputType === "github_readme" && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="flex-1 rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-[#f5c518] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={fetchingRepo || !githubUrl.trim()}
                  onClick={handleFetchGithubReadme}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 px-3 py-2 text-xs font-medium text-zinc-200 cursor-pointer"
                >
                  {fetchingRepo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f5c518]" />
                  ) : (
                    <GitBranch className="h-3.5 w-3.5 text-[#f5c518]" />
                  )}
                  Fetch
                </button>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-xs">
                <span className="text-zinc-400 font-medium">Target Role</span>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => onRoleChange(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-zinc-400 font-medium">Level (Segment)</span>
                <select
                  value={experienceLevel}
                  onChange={(e) =>
                    onExperienceLevelChange(e.target.value as ExperienceLevel)
                  }
                  className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
                >
                  <option value="student">Student / Fresher</option>
                  <option value="mid">Mid-Level Engineer</option>
                  <option value="senior">Senior / Staff</option>
                </select>
              </label>
            </div>

            <form onSubmit={handleAnalyze} className="space-y-3">
              <div className="rounded-lg border border-zinc-800 bg-[#09090b] focus-within:border-[#f5c518] transition overflow-hidden">
                <textarea
                  rows={9}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !loading) {
                      e.preventDefault();
                      void runAnalysis();
                    }
                  }}
                  placeholder="Paste your markdown README, resume bullets, or hackathon pitch..."
                  className="w-full bg-transparent p-3.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-y leading-relaxed"
                />
                <div className="flex items-center justify-between border-t border-zinc-800/80 px-3.5 py-1.5 font-mono text-[10px] text-zinc-500">
                  <span className="tabular-nums">
                    {wordCount} words · {lineCount} lines
                  </span>
                  <span>Ctrl + Enter</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#f5c518] hover:bg-[#ffd43b] disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-black transition cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Flame className="h-4 w-4 stroke-[2.25]" />
                )}
                {loading ? "Analyzing Draft..." : "Roast & Upgrade Copy"}
              </button>
            </form>

            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Experiment View & Results */}
        <section className="lg:col-span-7">
          {!analysis ? (
            <div className="rounded-xl border border-zinc-800 bg-[#111115] overflow-hidden">
              <div className="border-b border-zinc-800 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 block">
                    Flagsmith Experiment Assignment
                  </span>
                  <h3 className="text-sm font-semibold text-zinc-100 mt-0.5">
                    Assigned Bucket:{" "}
                    <code className="font-mono text-[#f5c518]">{strategyVariant}</code>
                  </h3>
                </div>
                <span className="rounded border border-zinc-800 bg-[#09090b] px-2.5 py-1 font-mono text-[11px] text-zinc-400">
                  unlock: {unlockVariant}
                </span>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div
                    className={`rounded-lg border p-4 space-y-1.5 ${
                      strategyVariant === "brutal_checklist"
                        ? "border-[#f5c518]/60 bg-[#f5c518]/[0.04]"
                        : "border-zinc-800 bg-[#09090b]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-zinc-100">
                        Variant A · Brutal Checklist
                      </span>
                      {strategyVariant === "brutal_checklist" && (
                        <span className="rounded bg-[#f5c518] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-black">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Blunt red-flag teardown with inline Before → After snippets and an interactive 4-point fix list.
                    </p>
                  </div>

                  <div
                    className={`rounded-lg border p-4 space-y-1.5 ${
                      strategyVariant === "guided_coach"
                        ? "border-[#f5c518]/60 bg-[#f5c518]/[0.04]"
                        : "border-zinc-800 bg-[#09090b]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-zinc-100">
                        Variant B · Guided Coach
                      </span>
                      {strategyVariant === "guided_coach" && (
                        <span className="rounded bg-[#f5c518] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-black">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Interactive 3-step diagnostic coaching where your chosen metrics customize the unlocked rewrite.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-[#09090b]">
                  <div className="border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span>EVALUATION RUBRIC WEIGHTS</span>
                    <span>PRIMARY KPI: rewrite_copied</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800 text-xs">
                    {[
                      { k: "Impact", w: "34%", desc: "Quantified metrics" },
                      { k: "Clarity", w: "24%", desc: "Hook & specificity" },
                      { k: "Actionable", w: "24%", desc: "Setup / ownership" },
                      { k: "Readable", w: "18%", desc: "Scannable lines" },
                    ].map((item) => (
                      <div key={item.k} className="p-3.5 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-200">{item.k}</span>
                          <span className="font-mono text-[#f5c518] font-semibold">
                            {item.w}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 pt-1">
                  <span>
                    Run the draft on the left to trigger{" "}
                    <code className="font-mono text-zinc-200">$flag_exposure</code> and{" "}
                    <code className="font-mono text-zinc-200">roast_completed</code>.
                  </span>
                  <button
                    type="button"
                    onClick={onOpenInspector}
                    className="font-mono text-[11px] text-[#f5c518] hover:underline cursor-pointer"
                  >
                    Open SDK Inspector →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-[#111115] p-6 space-y-6">
              {/* Scorecard Top Row */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-5">
                <div className="space-y-2 max-w-lg">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-[#f5c518]/40 bg-[#f5c518]/10 px-2 py-0.5 text-[11px] font-semibold text-[#f5c518]">
                      {analysis.verdictBadge}
                    </span>
                    <span className="rounded border border-zinc-800 bg-[#09090b] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                      {analysis.engineSource}
                    </span>
                    <span className="rounded border border-zinc-800 bg-[#09090b] px-2 py-0.5 font-mono text-[10px] text-zinc-200">
                      {strategyVariant}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-50 leading-snug">
                    {analysis.roastHeadline}
                  </h2>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-[#09090b] px-4 py-2.5 text-right min-w-[112px]">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 block">
                    Score
                  </span>
                  <div className="flex items-baseline justify-end gap-1">
                    <span
                      className={`text-3xl font-bold font-mono tabular-nums ${
                        analysis.overallScore >= 75
                          ? "text-[#f5c518]"
                          : analysis.overallScore >= 55
                            ? "text-zinc-100"
                            : "text-red-400"
                      }`}
                    >
                      {analysis.overallScore}
                    </span>
                    <span className="font-mono text-xs text-zinc-500">/100</span>
                  </div>
                  {checkedCount > 0 && (
                    <span className="font-mono text-[10px] text-[#f5c518]">
                      → {projectedScore} est.
                    </span>
                  )}
                </div>
              </div>

              {/* 4 Pillar Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Impact", val: analysis.metricsBreakdown.impactScore },
                  { label: "Clarity", val: analysis.metricsBreakdown.clarityScore },
                  {
                    label: "Actionable",
                    val: analysis.metricsBreakdown.actionabilityScore,
                  },
                  {
                    label: "Readable",
                    val: analysis.metricsBreakdown.readabilityScore,
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-lg border border-zinc-800 bg-[#09090b] p-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{m.label}</span>
                      <span className="font-mono font-semibold text-zinc-100 tabular-nums">
                        {m.val}
                      </span>
                    </div>
                    <div className="mt-2 h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        style={{ width: `${m.val}%` }}
                        className="h-full bg-[#f5c518] transition-all duration-300"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {analysis.detectedStack.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 mr-1">
                    Stack:
                  </span>
                  {analysis.detectedStack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded border border-zinc-800 bg-[#09090b] px-2 py-0.5 font-mono text-[10px] text-zinc-300"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              )}

              {/* VARIANT A: BRUTAL CHECKLIST vs VARIANT B: GUIDED COACH */}
              {!isGuided ? (
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Red Flags · Variant A Teardown
                    </h3>
                    <div className="space-y-2.5">
                      {analysis.redFlags.map((flag, idx) => (
                        <div
                          key={flag.id}
                          className={`rounded-lg border border-zinc-800 bg-[#09090b] p-3.5 text-xs space-y-2 border-l-2 ${
                            flag.severity === "high"
                              ? "border-l-red-500"
                              : "border-l-[#f5c518]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-semibold text-zinc-100">
                              <span className="font-mono text-[11px] text-zinc-500">
                                0{idx + 1}
                              </span>
                              <span>{flag.title}</span>
                            </div>
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                                flag.severity === "high"
                                  ? "border-red-500/30 bg-red-950/30 text-red-300"
                                  : "border-[#f5c518]/30 bg-[#f5c518]/10 text-[#f5c518]"
                              }`}
                            >
                              {flag.severity}
                            </span>
                          </div>
                          <p className="text-zinc-400 leading-relaxed">{flag.detail}</p>
                          {(flag.beforeSnippet || flag.afterSnippet) && (
                            <div className="grid sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                              {flag.beforeSnippet && (
                                <div className="rounded border border-zinc-800 bg-[#111115] p-2.5 text-zinc-400">
                                  <span className="block text-[9px] uppercase tracking-wider text-zinc-500 mb-1">
                                    Before
                                  </span>
                                  {flag.beforeSnippet}
                                </div>
                              )}
                              {flag.afterSnippet && (
                                <div className="rounded border border-[#f5c518]/30 bg-[#f5c518]/[0.05] p-2.5 text-zinc-100">
                                  <span className="block text-[9px] uppercase tracking-wider text-[#f5c518] mb-1">
                                    After Fix
                                  </span>
                                  {flag.afterSnippet}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        4-Point Fix Checklist
                      </h3>
                      <span className="font-mono text-[11px] text-[#f5c518] tabular-nums">
                        {checkedCount}/{analysis.checklistFixes.length} checked
                      </span>
                    </div>
                    <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-[#09090b]">
                      {analysis.checklistFixes.map((fix, i) => {
                        const checked = Boolean(checkedFixes[i]);
                        return (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() =>
                                setCheckedFixes((prev) => ({
                                  ...prev,
                                  [i]: !prev[i],
                                }))
                              }
                              className="w-full text-left flex items-start gap-3 px-3.5 py-2.5 text-xs transition hover:bg-[#111115] cursor-pointer"
                            >
                              <span
                                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  checked
                                    ? "border-[#f5c518] bg-[#f5c518] text-black"
                                    : "border-zinc-700 bg-transparent text-transparent"
                                }`}
                              >
                                <Check className="h-3 w-3 stroke-[2.5]" />
                              </span>
                              <span
                                className={
                                  checked
                                    ? "text-zinc-500 line-through"
                                    : "text-zinc-200"
                                }
                              >
                                {fix}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {!rewriteVisible && (
                    <button
                      type="button"
                      onClick={() => setCoachUnlocked(true)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#f5c518] bg-[#f5c518]/10 hover:bg-[#f5c518]/20 px-4 py-2.5 text-xs font-semibold text-[#f5c518] cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4" />
                      Reveal Improved Rewrite
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Guided Coach · Step 0{coachStep}/03
                    </h3>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setCoachStep(s)}
                          className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition cursor-pointer ${
                            s === coachStep
                              ? "bg-[#f5c518] text-black"
                              : s < coachStep
                                ? "border border-[#f5c518]/40 text-[#f5c518]"
                                : "border border-zinc-800 text-zinc-500"
                          }`}
                        >
                          0{s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {analysis.guidedSteps
                    .filter((s) => s.stepNumber === coachStep)
                    .map((step) => {
                      const currentInput = coachInputs[step.stepNumber] ?? {};
                      return (
                        <div
                          key={step.stepNumber}
                          className="rounded-lg border border-zinc-800 bg-[#09090b] p-4 space-y-3.5"
                        >
                          <div className="text-sm font-semibold text-zinc-100">
                            {step.stepNumber}. {step.title}
                          </div>
                          <p className="text-xs text-zinc-300 leading-relaxed">
                            {step.diagnosticPrompt}
                          </p>
                          <div className="rounded-md border border-zinc-800 bg-[#111115] p-3 text-xs space-y-1.5">
                            <div className="text-zinc-400">{step.coachTip}</div>
                            <div className="font-mono text-[11px] text-[#f5c518] pt-1">
                              Example: {step.exampleImprovement}
                            </div>
                          </div>

                          {step.quickChips && step.quickChips.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[11px] text-zinc-500 block">
                                Select a focus to inject into your rewrite:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {step.quickChips.map((chip) => {
                                  const selected = currentInput.chip === chip;
                                  return (
                                    <button
                                      key={chip}
                                      type="button"
                                      onClick={() =>
                                        setCoachInputs((prev) => ({
                                          ...prev,
                                          [step.stepNumber]: {
                                            ...prev[step.stepNumber],
                                            chip: selected ? undefined : chip,
                                          },
                                        }))
                                      }
                                      className={`rounded-md border px-2.5 py-1 text-[11px] transition cursor-pointer ${
                                        selected
                                          ? "border-[#f5c518] bg-[#f5c518]/15 text-[#f5c518] font-medium"
                                          : "border-zinc-800 bg-[#111115] text-zinc-300 hover:border-zinc-700"
                                      }`}
                                    >
                                      {chip}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <input
                            type="text"
                            value={currentInput.note ?? ""}
                            onChange={(e) =>
                              setCoachInputs((prev) => ({
                                ...prev,
                                [step.stepNumber]: {
                                  ...prev[step.stepNumber],
                                  note: e.target.value,
                                },
                              }))
                            }
                            placeholder={
                              step.inputPlaceholder ||
                              "Optional: enter your real benchmark or angle..."
                            }
                            className="w-full rounded-md border border-zinc-800 bg-[#111115] px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#f5c518] focus:outline-none"
                          />

                          <div className="flex justify-end gap-2 pt-1">
                            {coachStep < 3 ? (
                              <button
                                type="button"
                                onClick={() => setCoachStep((s) => s + 1)}
                                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 hover:bg-white px-3.5 py-1.5 text-xs font-semibold text-black cursor-pointer"
                              >
                                Next Step
                                <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setCoachUnlocked(true)}
                                className="inline-flex items-center gap-1.5 rounded-md bg-[#f5c518] hover:bg-[#ffd43b] px-3.5 py-1.5 text-xs font-semibold text-black cursor-pointer"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                Unlock Tailored Rewrite
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Upgraded Output Pane (Editor Style) */}
              {rewriteVisible && (
                <div className="rounded-lg border border-zinc-800 bg-[#09090b] overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-[#141418] px-3.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-zinc-200">
                        <FileCode2 className="h-3.5 w-3.5 text-[#f5c518]" />
                        upgraded.md
                      </span>
                      <div className="inline-flex rounded border border-zinc-800 bg-[#09090b] p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setOutputView("upgraded")}
                          className={`rounded px-2 py-0.5 cursor-pointer ${
                            outputView === "upgraded"
                              ? "bg-zinc-800 text-zinc-100 font-medium"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          Output
                        </button>
                        <button
                          type="button"
                          onClick={() => setOutputView("diff")}
                          className={`rounded px-2 py-0.5 cursor-pointer ${
                            outputView === "diff"
                              ? "bg-zinc-800 text-[#f5c518] font-medium"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          Before / After
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyShareCard}
                        className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-[#09090b] hover:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 cursor-pointer"
                      >
                        <Share2 className="h-3 w-3 text-zinc-400" />
                        {sharedCard ? "Card Copied" : "Share Card"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyRewrite}
                        className="inline-flex items-center gap-1.5 rounded bg-[#f5c518] hover:bg-[#ffd43b] px-3 py-1 text-xs font-semibold text-black cursor-pointer"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        ) : (
                          <ClipboardCopy className="h-3.5 w-3.5" />
                        )}
                        {copied ? "Copied · Tracked" : "Copy Upgraded Copy"}
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5">
                    {outputView === "upgraded" ? (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-200 leading-relaxed">
                        {displayedRewrite}
                      </pre>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="rounded border border-zinc-800 bg-[#111115] p-3 space-y-1.5">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 block">
                            Original Draft
                          </span>
                          <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-400 leading-relaxed">
                            {text.trim()}
                          </pre>
                        </div>
                        <div className="rounded border border-[#f5c518]/30 bg-[#f5c518]/[0.04] p-3 space-y-1.5">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-[#f5c518] block">
                            Upgraded Copy
                          </span>
                          <pre className="whitespace-pre-wrap font-mono text-[11px] text-zinc-100 leading-relaxed">
                            {displayedRewrite}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Helpfulness Rating */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-[#111115] px-3.5 py-2.5 text-xs">
                    <span className="text-zinc-400">
                      Rate this <code className="font-mono text-zinc-200">{strategyVariant}</code> output:
                    </span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => handleRate(star)}
                          className={`p-1 rounded transition cursor-pointer ${
                            rating !== null && star <= rating
                              ? "text-[#f5c518]"
                              : "text-zinc-600 hover:text-[#fde047]"
                          }`}
                        >
                          <Star className="h-4 w-4 fill-current" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <FlagsmithInspector
        open={inspectorOpen}
        onClose={onCloseInspector}
        connection={connection}
        visitorId={visitorId}
        traits={{ role, experience_level: experienceLevel, input_type: inputType }}
        flagsSnapshot={flagsSnapshot}
        logs={sdkLogs}
        onFlushNow={handleFlushSdkNow}
        onClearLogs={onClearLogs}
      />
    </div>
  );
}

export function DevRoastArena() {
  const [visitorId, setVisitorId] = useState<string>("");
  const [inputType, setInputType] = useState<InputType>("github_readme");
  const [role, setRole] = useState("Full-Stack Developer");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>("mid");
  const [stateData, setStateData] = useState<StateApiResponse | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [sdkLogs, setSdkLogs] = useState<FlagsmithEventLogEntry[]>([]);

  const flagsmithInstance = useMemo(() => createFlagsmithInstance(), []);
  const initializedEnvRef = useRef<string | null>(null);
  const lastSignatureRef = useRef<string>("");

  const appendSdkLog = useCallback(
    (
      kind: FlagsmithEventLogEntry["kind"],
      name: string,
      detail: string,
      payload: Record<string, unknown>,
      mode: ConnectionStatusPublic["mode"] = "local_experiment_mode"
    ) => {
      setSdkLogs((prev) =>
        [
          {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            kind,
            name,
            detail,
            mode,
            payload,
          },
          ...prev,
        ].slice(0, 40)
      );
    },
    []
  );

  const resolveOrCreateVisitorId = useCallback((): string => {
    try {
      const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
      if (existing) return existing;
      const fresh = `dev_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(VISITOR_STORAGE_KEY, fresh);
      return fresh;
    } catch {
      return `dev_${Math.random().toString(36).slice(2, 10)}`;
    }
  }, []);

  const refreshState = useCallback(async () => {
    const activeId = visitorId || resolveOrCreateVisitorId();
    const res = await fetch(
      `/api/experiment/state?visitorId=${encodeURIComponent(activeId)}&inputType=${encodeURIComponent(inputType)}&experienceLevel=${encodeURIComponent(experienceLevel)}&role=${encodeURIComponent(role)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    const json = (await res.json()) as StateApiResponse;
    if (!visitorId) setVisitorId(activeId);
    setStateData(json);
  }, [visitorId, resolveOrCreateVisitorId, inputType, experienceLevel, role]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const activeId = visitorId || resolveOrCreateVisitorId();
      const res = await fetch(
        `/api/experiment/state?visitorId=${encodeURIComponent(activeId)}&inputType=${encodeURIComponent(inputType)}&experienceLevel=${encodeURIComponent(experienceLevel)}&role=${encodeURIComponent(role)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const json = (await res.json()) as StateApiResponse;
      if (!cancelled) {
        if (!visitorId) setVisitorId(activeId);
        setStateData(json);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [visitorId, resolveOrCreateVisitorId, inputType, experienceLevel, role]);

  // Manage Flagsmith init once per env key, and identify() on visitor/trait changes
  useEffect(() => {
    if (!stateData || !visitorId) return;
    const envKey = stateData.connection.publicFlagsmithEnvKey || "__local__";
    const isLive = Boolean(stateData.connection.publicFlagsmithEnvKey);
    const traits = {
      role,
      experience_level: experienceLevel,
      input_type: inputType,
    };
    const sig = `${visitorId}|${role}|${experienceLevel}|${inputType}|${JSON.stringify(
      stateData.sdkState.flags
    )}`;

    if (initializedEnvRef.current !== envKey) {
      const previousEnv = initializedEnvRef.current;
      initializedEnvRef.current = envKey;
      lastSignatureRef.current = sig;

      const boot = async () => {
        if (previousEnv !== null) {
          await flagsmithInstance.close(800).catch(() => undefined);
        }
        try {
          if (isLive) {
            await flagsmithInstance.init({
              environmentID: envKey,
              identity: visitorId,
              traits,
              enableEvents: true,
              state: stateData.sdkState,
            });
          } else {
            await flagsmithInstance.init({
              environmentID: "devroast-local",
              preventFetch: true,
              enableEvents: false,
              state: stateData.sdkState,
            });
          }
        } catch {
          flagsmithInstance.setState(stateData.sdkState);
          flagsmithInstance._trigger?.();
        }
        appendSdkLog(
          "identify",
          isLive ? "flagsmith.init() + identify()" : "flagsmith.init(local IState)",
          `Initialized SDK for ${visitorId}`,
          { identity: visitorId, traits, mode: stateData.connection.mode },
          stateData.connection.mode
        );
      };
      void boot();
      return;
    }

    if (lastSignatureRef.current === sig) return;
    lastSignatureRef.current = sig;

    if (isLive) {
      flagsmithInstance
        .identify(visitorId, traits)
        .then(() => {
          appendSdkLog(
            "identify",
            "flagsmith.identify()",
            `Updated Edge identity & traits for ${visitorId}`,
            { identity: visitorId, traits },
            "live_flagsmith"
          );
        })
        .catch(() => undefined);
    } else {
      flagsmithInstance.setState(stateData.sdkState);
      flagsmithInstance._trigger?.();
      appendSdkLog(
        "sync",
        "flagsmith.setState()",
        `Re-evaluated local bucket for ${visitorId}`,
        { identity: visitorId, traits },
        "local_experiment_mode"
      );
    }
  }, [
    flagsmithInstance,
    stateData,
    visitorId,
    role,
    experienceLevel,
    inputType,
    appendSdkLog,
  ]);

  const handleRotateVisitor = () => {
    const next = `dev_${Math.random().toString(36).slice(2, 10)}`;
    try {
      window.localStorage.setItem(VISITOR_STORAGE_KEY, next);
    } catch {
      // Ignore storage errors
    }
    setVisitorId(next);
  };

  const handleReset = async (mode: "baseline" | "zero") => {
    const res = await fetch("/api/experiment/state", {
      method: "POST",
      headers: buildAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "reset", mode }),
    });
    if (!res.ok) return;
    await refreshState();
    setModalOpen(false);
  };

  if (!stateData || !visitorId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs font-mono text-zinc-400 gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-[#f5c518]" />
        Initializing Flagsmith Experiment Arena...
      </div>
    );
  }

  return (
    <>
      <FlagsmithProvider
        flagsmith={flagsmithInstance}
        serverState={stateData.sdkState}
      >
        <ArenaInner
          connection={stateData.connection}
          scoreboard={stateData.scoreboard}
          visitorId={visitorId}
          onRotateVisitor={handleRotateVisitor}
          onOpenSettings={() => setModalOpen(true)}
          onOpenInspector={() => setInspectorOpen(true)}
          sdkLogs={sdkLogs}
          onLogSdkEvent={(kind, name, detail, payload) =>
            appendSdkLog(kind, name, detail, payload, stateData.connection.mode)
          }
          inputType={inputType}
          onInputTypeChange={setInputType}
          role={role}
          onRoleChange={setRole}
          experienceLevel={experienceLevel}
          onExperienceLevelChange={setExperienceLevel}
          onRefreshState={refreshState}
          inspectorOpen={inspectorOpen}
          onCloseInspector={() => setInspectorOpen(false)}
          onClearLogs={() => setSdkLogs([])}
        />
      </FlagsmithProvider>

      {modalOpen && (
        <ConnectFlagsmithModal
          onClose={() => setModalOpen(false)}
          connection={stateData.connection}
          onUpdated={refreshState}
          onReset={handleReset}
        />
      )}
    </>
  );
}
