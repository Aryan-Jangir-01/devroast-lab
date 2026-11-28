"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Download,
  Eye,
  Flame,
  Layers,
  Lock,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  Unlock,
} from "lucide-react";
import {
  buildAdminHeaders,
  getStoredAdminKey,
  setStoredAdminKey,
} from "@/lib/auth/clientAdmin";
import type {
  BayesianScoreboard,
  ConnectionStatusPublic,
  ExperimentStoreData,
} from "@/lib/types";

interface ScoreboardApiPayload {
  connection: ConnectionStatusPublic;
  store: ExperimentStoreData;
  scoreboard: BayesianScoreboard;
}

export function ScoreboardView() {
  const [data, setData] = useState<ScoreboardApiPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [segmentTab, setSegmentTab] = useState<"input" | "experience">("input");
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/experiment/state", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as ScoreboardApiPayload;
    setData(json);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const stored = getStoredAdminKey();
      const res = await fetch("/api/experiment/state", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as ScoreboardApiPayload;
      if (!cancelled) {
        setData(json);
        if (!json.connection.adminProtected || stored) {
          setAdminUnlocked(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUnlockAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKeyInput.trim()) return;
    setBusy(true);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminKeyInput.trim() }),
      });
      if (!res.ok) {
        setStatusBanner("Invalid admin passcode.");
        return;
      }
      setStoredAdminKey(adminKeyInput.trim());
      setAdminUnlocked(true);
      setAdminKeyInput("");
      setStatusBanner("Admin controls unlocked for this session.");
    } finally {
      setBusy(false);
    }
  };

  const handleSimulate = async () => {
    setBusy(true);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: buildAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "simulate", count: 30 }),
      });
      if (res.status === 401) {
        setAdminUnlocked(false);
        setStatusBanner("Admin unlock required to simulate sessions.");
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleWeightShift = async (brutalWeight: number) => {
    setBusy(true);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/experiment/state", {
        method: "POST",
        headers: buildAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "update_weights", brutalWeight }),
      });
      if (res.status === 401) {
        setAdminUnlocked(false);
        setStatusBanner("Admin unlock required to modify traffic allocation.");
        return;
      }
      const json = (await res.json()) as {
        cloudSync?: { synced: boolean; message: string };
      };
      if (json.cloudSync?.message) {
        setStatusBanner(json.cloudSync.message);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleToggleScoreboardFlag = async () => {
    if (!data) return;
    setBusy(true);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/experiment/state", {
        method: "POST",
        headers: buildAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "toggle_scoreboard",
          scoreboardEnabled: !data.store.scoreboardEnabled,
        }),
      });
      if (res.status === 401) {
        setAdminUnlocked(false);
        setStatusBanner("Admin unlock required to toggle Flagsmith flags.");
        return;
      }
      const json = (await res.json()) as {
        cloudSync?: { synced: boolean; message: string };
      };
      if (json.cloudSync?.message) {
        setStatusBanner(json.cloudSync.message);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleResetZero = async () => {
    setBusy(true);
    setStatusBanner(null);
    try {
      const res = await fetch("/api/experiment/state", {
        method: "POST",
        headers: buildAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "reset", mode: "zero" }),
      });
      if (res.status === 401) {
        setAdminUnlocked(false);
        setStatusBanner("Admin unlock required to reset counts.");
        return;
      }
      await refresh();
      setStatusBanner("Experiment counters reset to zero.");
    } finally {
      setBusy(false);
    }
  };

  const handleExport = (format: "json" | "csv") => {
    if (!data) return;
    if (format === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `devroast-flagsmith-experiment-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const header = [
      "variant",
      "traffic_percent",
      "exposures",
      "completions",
      "rewrite_copies",
      "copy_conversion_rate",
      "avg_helpfulness",
      "avg_time_to_copy_ms",
      "chance_to_win",
      "lift_vs_control_percent",
      "ci95_low",
      "ci95_high",
    ].join(",");
    const rows = data.scoreboard.variants.map((v) =>
      [
        v.variant,
        v.trafficPercent,
        v.exposures,
        v.completions,
        v.rewriteCopies,
        v.copyConversionRate,
        v.avgHelpfulness,
        v.avgTimeToCopyMs,
        v.chanceToWin,
        v.liftVsControlPercent,
        v.credibleInterval95[0],
        v.credibleInterval95[1],
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devroast-flagsmith-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono text-xs text-zinc-400">
        Loading Experiment Scoreboard...
      </div>
    );
  }

  const { scoreboard, store, connection } = data;
  const activeSegments =
    segmentTab === "input" ? scoreboard.cohorts : scoreboard.experienceCohorts;
  const controlsUnlocked = !connection.adminProtected || adminUnlocked;
  const storageLabel =
    connection.storageBackend === "upstash_redis"
      ? "Redis Shared"
      : connection.storageBackend === "filesystem"
        ? "Local Disk"
        : "Ephemeral Tmp";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 bg-[#09090b]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#111115] hover:border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-zinc-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Arena
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-zinc-50 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#f5c518]" />
                  Experiment Scoreboard
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-[#111115] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
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
                <span className="rounded border border-zinc-800 bg-[#111115] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                  {storageLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport("csv")}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#111115] hover:border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-zinc-400" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport("json")}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#111115] hover:border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-zinc-400" />
              JSON
            </button>
            {controlsUnlocked && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSimulate}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#f5c518] hover:bg-[#ffd43b] px-3 py-1.5 text-xs font-semibold text-black cursor-pointer disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  Simulate 30 Sessions
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResetZero}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#111115] hover:border-red-500/40 hover:text-red-300 px-2.5 py-1.5 text-xs text-zinc-400 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-6">
        {statusBanner && (
          <div className="rounded-lg border border-[#f5c518]/35 bg-[#f5c518]/10 px-4 py-2.5 text-xs text-[#fde047] flex items-center justify-between gap-2">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-[11px] font-mono underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
        {!store.scoreboardEnabled && (
          <div className="rounded-lg border border-[#f5c518]/40 bg-[#f5c518]/10 px-4 py-3 text-xs text-[#fde047] flex items-center justify-between gap-3">
            <span>
              <code className="font-mono">live_scoreboard_enabled</code> is currently{" "}
              <strong>OFF</strong> — header link is hidden in the Arena.
            </span>
            <button
              type="button"
              onClick={handleToggleScoreboardFlag}
              className="rounded border border-[#f5c518]/50 bg-[#f5c518]/20 px-2.5 py-1 font-semibold cursor-pointer"
            >
              Re-enable
            </button>
          </div>
        )}

        {/* Unified KPI & Bayesian Verdict Card */}
        <div className="rounded-xl border border-zinc-800 bg-[#111115] overflow-hidden">
          <div className="p-5 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#f5c518]">
                <Trophy className="h-3.5 w-3.5" />
                Bayesian Verdict · {scoreboard.experimentKey}
                <span
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] normal-case ${
                    scoreboard.sampleRatioMismatch.hasMismatch
                      ? "border-red-500/40 bg-red-950/30 text-red-300"
                      : "border-zinc-700 bg-[#09090b] text-zinc-300"
                  }`}
                >
                  {scoreboard.sampleRatioMismatch.hasMismatch ? (
                    <ShieldAlert className="h-3 w-3 text-red-400" />
                  ) : (
                    <ShieldCheck className="h-3 w-3 text-[#f5c518]" />
                  )}
                  {scoreboard.sampleRatioMismatch.hasMismatch
                    ? `SRM Alert (χ²=${scoreboard.sampleRatioMismatch.chiSquare})`
                    : `SRM Healthy (${Math.round(scoreboard.sampleRatioMismatch.actualSplitA * 100)}/${100 - Math.round(scoreboard.sampleRatioMismatch.actualSplitA * 100)})`}
                </span>
              </div>
              <p className="text-sm font-medium text-zinc-100">{scoreboard.summary}</p>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <CheckCircle2
                className={`h-3.5 w-3.5 ${
                  scoreboard.winnerConfidenceMet ? "text-[#f5c518]" : "text-zinc-600"
                }`}
              />
              <span>
                {scoreboard.winnerConfidenceMet
                  ? "Confidence Met (90%+ & ≥20/arm)"
                  : scoreboard.samplesNeeded > 0
                    ? `Need ${scoreboard.samplesNeeded} more on smaller arm`
                    : "Awaiting 90% posterior"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800 border-t border-zinc-800 bg-[#09090b] font-mono">
            <div className="p-4">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
                Total Exposures
              </span>
              <span className="text-xl font-bold text-zinc-50 tabular-nums mt-0.5 block">
                {scoreboard.totalExposures}
              </span>
            </div>
            <div className="p-4">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
                Primary KPI · Copies
              </span>
              <span className="text-xl font-bold text-[#f5c518] tabular-nums mt-0.5 block">
                {scoreboard.totalCopies}
              </span>
            </div>
            <div className="p-4">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
                Min Sample Gate
              </span>
              <span className="text-xl font-bold text-zinc-100 tabular-nums mt-0.5 block">
                {scoreboard.minSamplesObserved}/{scoreboard.minSamplesPerArmTarget}
              </span>
            </div>
            <div className="p-4">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
                Simulation Draws
              </span>
              <span className="text-xl font-bold text-zinc-300 tabular-nums mt-0.5 block">
                4,000
              </span>
            </div>
          </div>
        </div>

        {/* Head-to-Head Variants */}
        <div className="grid md:grid-cols-2 gap-5">
          {scoreboard.variants.map((v) => {
            const isLeader = v.variant === scoreboard.leadingVariant;
            const isVariantA = v.variant === "brutal_checklist";
            const liftLabel = isVariantA
              ? "Control Baseline"
              : `${v.liftVsControlPercent >= 0 ? "+" : ""}${v.liftVsControlPercent.toFixed(1)}% Lift vs A`;

            return (
              <div
                key={v.variant}
                className={`rounded-xl border p-5 space-y-4 bg-[#111115] ${
                  isLeader ? "border-[#f5c518]/60" : "border-zinc-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isVariantA ? "bg-[#f5c518]" : "bg-zinc-100"
                        }`}
                      />
                      <span className="text-sm font-semibold text-zinc-100">
                        {v.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-500 mt-1">
                      <span>Traffic: {v.trafficPercent}%</span>
                      <span>·</span>
                      <span
                        className={
                          isVariantA
                            ? "text-zinc-400"
                            : v.liftVsControlPercent >= 0
                              ? "text-[#f5c518]"
                              : "text-red-400"
                        }
                      >
                        {liftLabel}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`rounded border px-2.5 py-1 font-mono text-xs font-semibold tabular-nums shrink-0 ${
                      isLeader
                        ? "border-[#f5c518]/50 bg-[#f5c518]/15 text-[#f5c518]"
                        : "border-zinc-800 bg-[#09090b] text-zinc-300"
                    }`}
                  >
                    {(v.chanceToWin * 100).toFixed(1)}% Win
                  </span>
                </div>

                <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    style={{ width: `${Math.round(v.chanceToWin * 100)}%` }}
                    className={`h-full transition-all duration-500 ${
                      isVariantA ? "bg-[#f5c518]" : "bg-zinc-100"
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-2.5">
                    <span className="text-zinc-500 block text-[11px]">Copy Conv.</span>
                    <span className="font-mono text-sm font-bold text-zinc-100 tabular-nums">
                      {(v.copyConversionRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-2.5">
                    <span className="text-zinc-500 block text-[11px]">Completion</span>
                    <span className="font-mono text-sm font-bold text-zinc-100 tabular-nums">
                      {(v.completionRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-2.5">
                    <span className="text-zinc-500 block text-[11px]">Avg Rating</span>
                    <span className="font-mono text-sm font-bold text-[#f5c518] tabular-nums">
                      {v.avgHelpfulness.toFixed(1)} ★
                    </span>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-2.5">
                    <span className="text-zinc-500 block text-[11px]">Time to Copy</span>
                    <span className="font-mono text-sm font-bold text-zinc-200 tabular-nums">
                      {(v.avgTimeToCopyMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-500 border-t border-zinc-800 pt-3 tabular-nums">
                  <span>
                    Exposures: {v.exposures} · Copies: {v.rewriteCopies}
                  </span>
                  <span>
                    95% CI: [{(v.credibleInterval95[0] * 100).toFixed(1)}%,{" "}
                    {(v.credibleInterval95[1] * 100).toFixed(1)}%]
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Visual Funnel & 2nd Experiment */}
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl border border-zinc-800 bg-[#111115] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#f5c518]" />
                Funnel Drop-Off
              </h2>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-[#f5c518]">■ Variant A</span>
                <span className="text-zinc-200">■ Variant B</span>
              </div>
            </div>

            <div className="space-y-3.5 text-xs">
              {[
                {
                  stage: "1. Flag Exposed ($flag_exposure)",
                  aVal: scoreboard.variants[0].exposures,
                  aPct: scoreboard.variants[0].exposures > 0 ? 100 : 0,
                  bVal: scoreboard.variants[1].exposures,
                  bPct: scoreboard.variants[1].exposures > 0 ? 100 : 0,
                },
                {
                  stage: "2. Roast Completed (roast_completed)",
                  aVal: scoreboard.variants[0].completions,
                  aPct: Math.round(scoreboard.variants[0].completionRate * 100),
                  bVal: scoreboard.variants[1].completions,
                  bPct: Math.round(scoreboard.variants[1].completionRate * 100),
                },
                {
                  stage: "3. Rewrite Copied (Primary KPI)",
                  aVal: scoreboard.variants[0].rewriteCopies,
                  aPct: Math.round(scoreboard.variants[0].copyConversionRate * 100),
                  bVal: scoreboard.variants[1].rewriteCopies,
                  bPct: Math.round(scoreboard.variants[1].copyConversionRate * 100),
                },
                {
                  stage: "4. Rated Helpful ≥ 4★ (feedback_helpful)",
                  aVal: scoreboard.variants[0].helpfulVotes,
                  aPct:
                    scoreboard.variants[0].exposures > 0
                      ? Math.round(
                          (scoreboard.variants[0].helpfulVotes /
                            scoreboard.variants[0].exposures) *
                            100
                        )
                      : 0,
                  bVal: scoreboard.variants[1].helpfulVotes,
                  bPct:
                    scoreboard.variants[1].exposures > 0
                      ? Math.round(
                          (scoreboard.variants[1].helpfulVotes /
                            scoreboard.variants[1].exposures) *
                            100
                        )
                      : 0,
                },
              ].map((row) => (
                <div key={row.stage} className="space-y-1.5">
                  <div className="flex items-center justify-between text-zinc-300">
                    <span>{row.stage}</span>
                    <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                      A: {row.aVal} ({row.aPct}%) · B: {row.bVal} ({row.bPct}%)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        style={{ width: `${row.aPct}%` }}
                        className="h-full bg-[#f5c518] transition-all duration-500"
                      />
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        style={{ width: `${row.bPct}%` }}
                        className="h-full bg-zinc-100 transition-all duration-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 rounded-xl border border-zinc-800 bg-[#111115] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">
                Experiment 2 · Unlock Gate
              </h2>
              <code className="rounded border border-zinc-800 bg-[#09090b] px-2 py-0.5 font-mono text-[10px] text-[#f5c518]">
                rewrite_unlock_flow
              </code>
            </div>
            <p className="text-xs text-zinc-400">
              Compares immediate rewrite reveal against an interactive unlock action.
            </p>

            <div className="space-y-2.5">
              {scoreboard.unlockExperiment.variants.map((uv) => {
                const isWinner =
                  uv.variant === scoreboard.unlockExperiment.leadingVariant;
                return (
                  <div
                    key={uv.variant}
                    className={`rounded-lg border p-3.5 space-y-2 bg-[#09090b] ${
                      isWinner ? "border-[#f5c518]/50" : "border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-100">
                        {uv.label}{" "}
                        <code className="font-mono text-[10px] text-zinc-500">
                          ({uv.variant})
                        </code>
                      </span>
                      <span className="font-mono font-bold text-[#f5c518] tabular-nums">
                        {(uv.chanceToWin * 100).toFixed(1)}% Win
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 tabular-nums">
                      <span>
                        Copy Conv: {(uv.copyConversionRate * 100).toFixed(1)}%
                      </span>
                      <span>
                        {uv.rewriteCopies}/{uv.exposures} copied
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Traffic Split + Cohort Segmentation */}
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-xl border border-zinc-800 bg-[#111115] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Flame className="h-4 w-4 text-[#f5c518]" />
                Traffic Split &amp; Flag Controls
              </h2>
              {connection.adminProtected && (
                <span className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-[#09090b] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                  {controlsUnlocked ? (
                    <Unlock className="h-2.5 w-2.5 text-[#f5c518]" />
                  ) : (
                    <Lock className="h-2.5 w-2.5 text-zinc-500" />
                  )}
                  {controlsUnlocked ? "Unlocked" : "Admin Locked"}
                </span>
              )}
            </div>

            {!controlsUnlocked ? (
              <form onSubmit={handleUnlockAdmin} className="space-y-3">
                <p className="text-xs text-zinc-400">
                  Admin passcode is active on this deployment so public visitors cannot reset counters or shift Flagsmith traffic splits.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={adminKeyInput}
                    onChange={(e) => setAdminKeyInput(e.target.value)}
                    placeholder="Enter DEVROAST_ADMIN_KEY"
                    className="flex-1 rounded-md border border-zinc-800 bg-[#09090b] px-3 py-1.5 font-mono text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-md bg-[#f5c518] hover:bg-[#ffd43b] px-3 py-1.5 text-xs font-semibold text-black cursor-pointer"
                  >
                    Unlock
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="text-xs text-zinc-400">
                  Shift traffic allocation dynamically or promote the winning variant to 100% (syncs to Flagsmith Cloud when Management Key is set).
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "50 / 50 Split", val: 50 },
                    { label: "80 / 20 Brutal", val: 80 },
                    { label: "20 / 80 Coach", val: 20 },
                    { label: "100% Winner (Brutal)", val: 100 },
                    { label: "100% Winner (Coach)", val: 0 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={busy}
                      onClick={() => handleWeightShift(preset.val)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                        store.weights.brutal_checklist === preset.val
                          ? "border-[#f5c518] bg-[#f5c518] text-black font-semibold"
                          : "border-zinc-800 bg-[#09090b] text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-xs">
                  <span className="text-zinc-400">
                    Flag 3: <code className="font-mono text-zinc-200">live_scoreboard_enabled</code>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleToggleScoreboardFlag}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                      store.scoreboardEnabled
                        ? "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]"
                        : "border-zinc-800 bg-[#09090b] text-zinc-500"
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    {store.scoreboardEnabled ? "Enabled" : "Hidden"}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="lg:col-span-7 rounded-xl border border-zinc-800 bg-[#111115] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">
                Segment Breakdown (Flagsmith Traits)
              </h2>
              <div className="inline-flex rounded-md border border-zinc-800 bg-[#09090b] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSegmentTab("input")}
                  className={`rounded px-2.5 py-1 cursor-pointer ${
                    segmentTab === "input"
                      ? "bg-[#f5c518] text-black font-semibold"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  By Input Type
                </button>
                <button
                  type="button"
                  onClick={() => setSegmentTab("experience")}
                  className={`rounded px-2.5 py-1 cursor-pointer ${
                    segmentTab === "experience"
                      ? "bg-[#f5c518] text-black font-semibold"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  By Experience Level
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 font-mono text-[11px]">
                    <th className="py-2 pr-4 font-medium">Segment</th>
                    <th className="py-2 pr-4 font-medium">Brutal Checklist Copy %</th>
                    <th className="py-2 font-medium">Guided Coach Copy %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {activeSegments.map((c) => (
                    <tr key={c.cohortKey}>
                      <td className="py-2.5 pr-4 font-medium text-zinc-200">
                        {c.label}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[#f5c518] tabular-nums">
                        {(c.brutalCopyRate * 100).toFixed(1)}%{" "}
                        <span className="text-zinc-500">({c.brutalExposures})</span>
                      </td>
                      <td className="py-2.5 font-mono text-zinc-100 tabular-nums">
                        {(c.coachCopyRate * 100).toFixed(1)}%{" "}
                        <span className="text-zinc-500">({c.coachExposures})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Live Submission Feed */}
        <div className="rounded-xl border border-zinc-800 bg-[#111115] p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-100">
            Recent Anonymized Roast Sessions
          </h2>
          {store.recentFeed.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No sessions logged yet. Run a roast in the Arena or simulate sessions above.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {store.recentFeed.slice(0, 9).map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-zinc-800 bg-[#09090b] p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-zinc-200">{item.variant}</span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                          item.trafficSource === "live"
                            ? "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]"
                            : "border-zinc-800 bg-zinc-900 text-zinc-500"
                        }`}
                      >
                        {item.trafficSource === "live" ? "Live" : "Sim"}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-zinc-100 tabular-nums">
                      {item.score}/100
                    </span>
                  </div>
                  <div className="text-zinc-500 text-[11px]">
                    {item.inputType} · {item.experienceLevel}
                    {item.role ? ` · ${item.role}` : ""}
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-900">
                    <span
                      className={
                        item.copiedRewrite ? "text-[#f5c518]" : "text-zinc-500"
                      }
                    >
                      {item.copiedRewrite ? "Copied Rewrite" : "Viewed Only"}
                    </span>
                    {item.rating && (
                      <span className="font-mono text-[#f5c518]">{item.rating} ★</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
