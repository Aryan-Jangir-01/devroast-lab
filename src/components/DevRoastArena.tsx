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
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardCopy,
  FileText,
  Flame,
  GitBranch,
  Loader2,
  RefreshCw,
  Settings,
  Share2,
  Sparkles,
  Star,
  Target,
} from "lucide-react";
import { ConnectFlagsmithModal } from "@/components/ConnectFlagsmithModal";
import { FlagsmithInspector } from "@/components/FlagsmithInspector";
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

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const strategyExpId = flags.roast_strategy_experiment?.experiment?.id;
      const unlockExpId = flags.rewrite_unlock_flow?.experiment?.id;

      const strategyExposurePayload = {
        identifier: visitorId,
        value: strategyVariant,
        metadata: {
          ...(strategyExpId ? { experiment_id: strategyExpId } : {}),
          inputType,
          experienceLevel,
        },
      };
      const unlockExposurePayload = {
        identifier: visitorId,
        value: unlockVariant,
        metadata: {
          ...(unlockExpId ? { experiment_id: unlockExpId } : {}),
          inputType,
          strategyVariant,
        },
      };

      if (flagsmith.eventsEnabled) {
        flagsmith.trackExposureEvent(
          "roast_strategy_experiment",
          strategyExposurePayload
        );
        flagsmith.trackExposureEvent("rewrite_unlock_flow", unlockExposurePayload);
      }

      onLogSdkEvent(
        "exposure",
        "$flag_exposure · roast_strategy_experiment",
        `Bucketed visitor into "${strategyVariant}"`,
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
      inExperiment: Boolean(f?.experiment?.inExperiment),
    };
  });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#07080d]/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 text-slate-950 shadow-lg shadow-orange-500/20">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold text-slate-50">DevRoast Lab</h1>
                <span className="rounded-full border border-orange-500/40 bg-orange-500/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-orange-300">
                  Flagsmith: {strategyVariant}
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                  {connection.mode === "live_flagsmith"
                    ? "Live Flagsmith Edge"
                    : "Local Experiment Mode"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Toggle Wars Track 01 · Live A/B Test: Brutal Checklist vs Guided Coach
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRotateVisitor}
              title="Assign a fresh visitor identity to test Flagsmith multivariate bucketing"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 px-3 py-2 font-mono text-[11px] text-slate-300 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
              {visitorId}
            </button>

            <button
              type="button"
              onClick={onOpenInspector}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/35 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-2 text-xs font-medium text-cyan-200 cursor-pointer"
            >
              <Activity className="h-3.5 w-3.5" />
              SDK Inspector ({sdkLogs.length})
            </button>

            {showScoreboardLink && (
              <Link
                href="/scoreboard"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 px-3 py-2 text-xs font-semibold text-emerald-200"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Live Scoreboard ({scoreboard.totalExposures})
              </Link>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5 text-orange-400" />
              Flagsmith Setup
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 grid lg:grid-cols-12 gap-6">
        {/* Left: Submission & Persona Traits */}
        <section className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-[#0d1018] p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-100">
                Paste Your README, Resume, or Pitch
              </h2>
              <p className="text-xs text-slate-400">
                Flagsmith identifies your traits and buckets you into Variant A or B in real time.
              </p>
            </div>

            {/* Input Type Tabs */}
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950 p-1 border border-slate-800">
              {(
                [
                  { id: "github_readme", label: "GitHub README" },
                  { id: "resume_bullets", label: "Resume Bullets" },
                  { id: "project_pitch", label: "Project Pitch" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleLoadSample(tab.id)}
                  className={`rounded-lg py-2 px-2 text-xs font-medium transition cursor-pointer ${
                    inputType === tab.id
                      ? "bg-orange-500 text-slate-950 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {inputType === "github_readme" && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="Optional: https://github.com/owner/repo"
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={fetchingRepo || !githubUrl.trim()}
                  onClick={handleFetchGithubReadme}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 px-3 py-2 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  {fetchingRepo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <GitBranch className="h-3.5 w-3.5 text-cyan-400" />
                  )}
                  Fetch README
                </button>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-xs">
                <span className="text-slate-400">Target Role (Flagsmith Trait)</span>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => onRoleChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-400">Experience Level (Segment)</span>
                <select
                  value={experienceLevel}
                  onChange={(e) =>
                    onExperienceLevelChange(e.target.value as ExperienceLevel)
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                >
                  <option value="student">Student / Fresher</option>
                  <option value="mid">Mid-Level Engineer</option>
                  <option value="senior">Senior / Staff</option>
                </select>
              </label>
            </div>

            <form onSubmit={handleAnalyze} className="space-y-3">
              <textarea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste your markdown README, resume bullets, or hackathon pitch..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-slate-950 transition cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Flame className="h-4 w-4" />
                )}
                {loading ? "Roasting & Scoring..." : "Roast & Upgrade My Copy"}
              </button>
            </form>

            {error && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
                {error}
              </div>
            )}
          </div>
        </section>

        {/* Right: Flagsmith Variant Experience */}
        <section className="lg:col-span-7">
          {!analysis ? (
            <div className="h-full min-h-[420px] rounded-2xl border border-dashed border-slate-800 bg-[#0d1018]/60 p-8 flex flex-col items-center justify-center text-center space-y-3">
              <Target className="h-10 w-10 text-orange-400/80" />
              <h3 className="text-base font-semibold text-slate-100">
                Active Flagsmith Bucket:{" "}
                <code className="font-mono text-orange-300">{strategyVariant}</code>
                <span className="text-slate-500 font-normal"> · </span>
                <code className="font-mono text-cyan-300 text-xs">{unlockVariant}</code>
              </h3>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                Click <strong>&quot;Roast &amp; Upgrade My Copy&quot;</strong> on the left to experience your Flagsmith-assigned variant. Click the visitor ID pill above anytime to test deterministic A/B bucketing, or inspect live SDK payloads in{" "}
                <button
                  type="button"
                  onClick={onOpenInspector}
                  className="text-cyan-300 underline cursor-pointer"
                >
                  SDK Inspector
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-[#0d1018] p-6 space-y-5">
              {/* Top Score Summary */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-orange-500/15 border border-orange-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-orange-300">
                      {analysis.verdictBadge}
                    </span>
                    <span className="rounded-full bg-slate-900 border border-slate-700 px-2.5 py-0.5 font-mono text-[10px] text-slate-300">
                      {analysis.engineSource}
                    </span>
                    <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 font-mono text-[10px] text-cyan-300">
                      {strategyVariant}
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-slate-50">
                    {analysis.roastHeadline}
                  </h2>
                </div>

                <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    Score
                  </span>
                  <span
                    className={`text-2xl font-bold font-mono ${
                      analysis.overallScore >= 75
                        ? "text-emerald-400"
                        : analysis.overallScore >= 55
                          ? "text-amber-400"
                          : "text-rose-400"
                    }`}
                  >
                    {analysis.overallScore}/100
                  </span>
                  {checkedCount > 0 && (
                    <span className="font-mono text-[10px] text-emerald-300">
                      → {projectedScore} projected
                    </span>
                  )}
                </div>
              </div>

              {/* 4 Pillar Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">{m.label}</span>
                      <span className="font-mono font-semibold text-slate-200">
                        {m.val}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        style={{ width: `${m.val}%` }}
                        className="h-full bg-gradient-to-r from-orange-400 to-emerald-400"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {analysis.detectedStack.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-500">Detected Stack:</span>
                  {analysis.detectedStack.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md border border-slate-800 bg-slate-950 px-2 py-0.5 font-mono text-[10px] text-slate-300"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              )}

              {/* VARIANT A: BRUTAL CHECKLIST vs VARIANT B: GUIDED COACH */}
              {!isGuided ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-300">
                      Brutal Red Flags (Variant A · Fast Teardown)
                    </h3>
                    <div className="grid gap-2.5">
                      {analysis.redFlags.map((flag) => (
                        <div
                          key={flag.id}
                          className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                              <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                              {flag.title}
                            </div>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                                flag.severity === "high"
                                  ? "bg-rose-500/15 text-rose-300"
                                  : flag.severity === "medium"
                                    ? "bg-amber-500/15 text-amber-300"
                                    : "bg-emerald-500/15 text-emerald-300"
                              }`}
                            >
                              {flag.severity}
                            </span>
                          </div>
                          <p className="text-slate-400">{flag.detail}</p>
                          {(flag.beforeSnippet || flag.afterSnippet) && (
                            <div className="grid sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                              {flag.beforeSnippet && (
                                <div className="rounded-lg border border-rose-500/25 bg-rose-950/20 p-2 text-rose-200">
                                  <span className="block text-[9px] uppercase text-rose-400 mb-0.5">
                                    Before
                                  </span>
                                  {flag.beforeSnippet}
                                </div>
                              )}
                              {flag.afterSnippet && (
                                <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-2 text-emerald-200">
                                  <span className="block text-[9px] uppercase text-emerald-400 mb-0.5">
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

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                        4-Point Fix Checklist
                      </h3>
                      <span className="font-mono text-[11px] text-slate-400">
                        {checkedCount}/{analysis.checklistFixes.length} reviewed
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-300">
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
                              className={`w-full text-left flex items-start gap-2 rounded-lg border px-3 py-2 transition cursor-pointer ${
                                checked
                                  ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200 line-through decoration-emerald-500/50"
                                  : "border-slate-800/70 bg-slate-950/40 hover:border-slate-700"
                              }`}
                            >
                              <CheckCircle2
                                className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                                  checked ? "text-emerald-400" : "text-slate-600"
                                }`}
                              />
                              <span>{fix}</span>
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
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/15 hover:bg-orange-500/25 px-4 py-2.5 text-xs font-semibold text-orange-200 cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4" />
                      Reveal Improved Rewrite
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                      Interactive Guided Coach (Variant B · Step {coachStep}/3)
                    </h3>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setCoachStep(s)}
                          className={`h-2 w-8 rounded-full transition cursor-pointer ${
                            s <= coachStep ? "bg-cyan-400" : "bg-slate-800"
                          }`}
                        />
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
                          className="rounded-xl border border-cyan-500/30 bg-cyan-950/15 p-4 space-y-3"
                        >
                          <div className="text-sm font-semibold text-slate-100">
                            Step {step.stepNumber}: {step.title}
                          </div>
                          <p className="text-xs text-cyan-200">
                            {step.diagnosticPrompt}
                          </p>
                          <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-3 text-xs space-y-1">
                            <div className="text-slate-400">{step.coachTip}</div>
                            <div className="font-mono text-emerald-300 pt-1">
                              Example: {step.exampleImprovement}
                            </div>
                          </div>

                          {step.quickChips && step.quickChips.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[11px] text-slate-400 block">
                                Pick a coaching focus (injects into your rewrite):
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
                                      className={`rounded-lg border px-2.5 py-1 text-[11px] transition cursor-pointer ${
                                        selected
                                          ? "border-cyan-400 bg-cyan-400/20 text-cyan-200 font-medium"
                                          : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
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
                              "Optional: add your real benchmark or angle..."
                            }
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
                          />

                          <div className="flex justify-end gap-2">
                            {coachStep < 3 ? (
                              <button
                                type="button"
                                onClick={() => setCoachStep((s) => s + 1)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 px-3.5 py-1.5 text-xs font-semibold text-slate-950 cursor-pointer"
                              >
                                Next Coaching Step
                                <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setCoachUnlocked(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 cursor-pointer"
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

              {/* Rewritten Output + Primary Conversion Event (rewrite_copied) */}
              {rewriteVisible && (
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/10 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-emerald-300">
                        Upgraded Version (Ready to Paste)
                      </span>
                      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setOutputView("upgraded")}
                          className={`rounded-md px-2 py-0.5 cursor-pointer ${
                            outputView === "upgraded"
                              ? "bg-emerald-500/20 text-emerald-200 font-semibold"
                              : "text-slate-400"
                          }`}
                        >
                          Upgraded
                        </button>
                        <button
                          type="button"
                          onClick={() => setOutputView("diff")}
                          className={`rounded-md px-2 py-0.5 cursor-pointer ${
                            outputView === "diff"
                              ? "bg-orange-500/20 text-orange-200 font-semibold"
                              : "text-slate-400"
                          }`}
                        >
                          Before → After
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyShareCard}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 cursor-pointer"
                      >
                        <Share2 className="h-3 w-3 text-cyan-300" />
                        {sharedCard ? "Card Copied!" : "Copy Roast Card"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyRewrite}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 cursor-pointer"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <ClipboardCopy className="h-3.5 w-3.5" />
                        )}
                        {copied ? "Copied! (Tracked)" : "Copy Upgraded Copy"}
                      </button>
                    </div>
                  </div>

                  {outputView === "upgraded" ? (
                    <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-[#07080d] p-3 font-mono text-xs text-slate-200 leading-relaxed">
                      {displayedRewrite}
                    </pre>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-rose-500/25 bg-[#07080d] p-3 space-y-1.5">
                        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
                          <FileText className="h-3 w-3" />
                          Original Draft
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-400 leading-relaxed">
                          {text.trim()}
                        </pre>
                      </div>
                      <div className="rounded-lg border border-emerald-500/25 bg-[#07080d] p-3 space-y-1.5">
                        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                          <Sparkles className="h-3 w-3" />
                          Upgraded Copy
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-emerald-100 leading-relaxed">
                          {displayedRewrite}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Helpfulness Rating */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    <span className="text-slate-400">
                      Was this {strategyVariant} flow helpful?
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => handleRate(star)}
                          className={`p-1 rounded transition cursor-pointer ${
                            rating !== null && star <= rating
                              ? "text-amber-400"
                              : "text-slate-600 hover:text-amber-300"
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
    await fetch("/api/experiment/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", mode }),
    });
    await refreshState();
    setModalOpen(false);
  };

  if (!stateData || !visitorId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-300 gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
        Loading Flagsmith Experiment Arena...
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
