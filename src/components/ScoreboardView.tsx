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
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
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

  const refresh = useCallback(async () => {
    const res = await fetch("/api/experiment/state", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as ScoreboardApiPayload;
    setData(json);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetch("/api/experiment/state", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as ScoreboardApiPayload;
      if (!cancelled) setData(json);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSimulate = async () => {
    setBusy(true);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "simulate", count: 30 }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleWeightShift = async (brutalWeight: number) => {
    setBusy(true);
    try {
      await fetch("/api/experiment/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_weights", brutalWeight }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleToggleScoreboardFlag = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await fetch("/api/experiment/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_scoreboard",
          scoreboardEnabled: !data.store.scoreboardEnabled,
        }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleResetZero = async () => {
    setBusy(true);
    try {
      await fetch("/api/experiment/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", mode: "zero" }),
      });
      await refresh();
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
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-300">
        Loading Live Experiment Scoreboard...
      </div>
    );
  }

  const { scoreboard, store, connection } = data;
  const activeSegments =
    segmentTab === "input" ? scoreboard.cohorts : scoreboard.experienceCohorts;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800/80 bg-[#07080d]/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Arena
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold text-slate-50 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-400" />
                  Toggle Wars Live Scoreboard
                </h1>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                  {connection.mode === "live_flagsmith"
                    ? "Live Flagsmith Edge"
                    : "Local Experiment Mode"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Flagsmith Experimentation · Primary Metric:{" "}
                <code className="text-orange-300">{scoreboard.primaryMetric}</code>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport("csv")}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-2 text-xs text-slate-300 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport("json")}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-2 text-xs text-slate-300 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-orange-400" />
              JSON
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSimulate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-3 py-2 text-xs font-medium text-emerald-200 cursor-pointer disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Simulate 30 User Sessions
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleResetZero}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs text-slate-300 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Counts
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-6">
        {!store.scoreboardEnabled && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex items-center justify-between gap-3">
            <span>
              <code>live_scoreboard_enabled</code> is currently toggled{" "}
              <strong>OFF</strong> — the public Scoreboard link is hidden in the Arena header.
            </span>
            <button
              type="button"
              onClick={handleToggleScoreboardFlag}
              className="rounded-lg bg-amber-400/20 border border-amber-400/40 px-2.5 py-1 font-semibold cursor-pointer"
            >
              Re-enable Link
            </button>
          </div>
        )}

        {/* Summary Banner + Statistical Integrity */}
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/25 via-[#0d1018] to-orange-950/20 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                <Trophy className="h-4 w-4" />
                Bayesian Experiment Verdict
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] normal-case ${
                    scoreboard.sampleRatioMismatch.hasMismatch
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {scoreboard.sampleRatioMismatch.hasMismatch ? (
                    <ShieldAlert className="h-3 w-3" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  {scoreboard.sampleRatioMismatch.hasMismatch
                    ? `SRM Alert (χ²=${scoreboard.sampleRatioMismatch.chiSquare})`
                    : `SRM Healthy (${Math.round(scoreboard.sampleRatioMismatch.actualSplitA * 100)}/${100 - Math.round(scoreboard.sampleRatioMismatch.actualSplitA * 100)})`}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-100">{scoreboard.summary}</p>
            </div>
            <div className="flex items-center gap-5 font-mono text-xs">
              <div>
                <span className="text-slate-400 block">Total Exposures</span>
                <span className="text-lg font-bold text-slate-50">
                  {scoreboard.totalExposures}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Rewrite Copies</span>
                <span className="text-lg font-bold text-emerald-400">
                  {scoreboard.totalCopies}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Power Gate</span>
                <span
                  className={`text-lg font-bold ${
                    scoreboard.winnerConfidenceMet
                      ? "text-emerald-300"
                      : "text-amber-300"
                  }`}
                >
                  {scoreboard.minSamplesObserved}/{scoreboard.minSamplesPerArmTarget}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 border-t border-slate-800/70 pt-3">
            <span className="flex items-center gap-1.5">
              <CheckCircle2
                className={`h-3.5 w-3.5 ${
                  scoreboard.winnerConfidenceMet ? "text-emerald-400" : "text-slate-500"
                }`}
              />
              {scoreboard.winnerConfidenceMet
                ? "90%+ Bayesian probability & minimum 20 exposures/arm reached — statistically safe to promote winner."
                : scoreboard.samplesNeeded > 0
                  ? `Collect ${scoreboard.samplesNeeded} more exposure(s) on the smaller arm to clear the 20/arm minimum sample gate.`
                  : "Sample gate cleared — waiting for >= 90.0% Bayesian win probability."}
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              4,000 Beta-Binomial Monte Carlo draws
            </span>
          </div>
        </div>

        {/* Head-to-Head Variants */}
        <div className="grid md:grid-cols-2 gap-5">
          {scoreboard.variants.map((v) => {
            const isLeader = v.variant === scoreboard.leadingVariant;
            const isControl = v.variant === "brutal_checklist";
            const liftLabel = isControl
              ? "Control Baseline"
              : `${v.liftVsControlPercent >= 0 ? "+" : ""}${v.liftVsControlPercent.toFixed(1)}% Lift vs A`;

            return (
              <div
                key={v.variant}
                className={`rounded-2xl border p-5 space-y-4 ${
                  isLeader
                    ? "border-emerald-500/50 bg-[#0d1018]"
                    : "border-slate-800 bg-[#0d1018]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">
                      {v.label}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-400 mt-0.5">
                      <span>Traffic: {v.trafficPercent}%</span>
                      <span>·</span>
                      <span
                        className={
                          isControl
                            ? "text-slate-400"
                            : v.liftVsControlPercent >= 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                        }
                      >
                        {liftLabel}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-mono text-xs font-bold shrink-0 ${
                      isLeader
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {(v.chanceToWin * 100).toFixed(1)}% Win Prob
                  </span>
                </div>

                <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden">
                  <div
                    style={{ width: `${Math.round(v.chanceToWin * 100)}%` }}
                    className={`h-full transition-all duration-500 ${
                      isLeader ? "bg-emerald-400" : "bg-orange-400"
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
                    <span className="text-slate-500 block">Copy Conv.</span>
                    <span className="font-mono text-sm font-bold text-slate-100">
                      {(v.copyConversionRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
                    <span className="text-slate-500 block">Completion</span>
                    <span className="font-mono text-sm font-bold text-slate-100">
                      {(v.completionRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
                    <span className="text-slate-500 block">Avg Rating</span>
                    <span className="font-mono text-sm font-bold text-amber-300">
                      {v.avgHelpfulness.toFixed(1)} ★
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
                    <span className="text-slate-500 block">Time to Copy</span>
                    <span className="font-mono text-sm font-bold text-cyan-300">
                      {(v.avgTimeToCopyMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-3">
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

        {/* Visual Funnel & 2nd Experiment (rewrite_unlock_flow) */}
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-[#0d1018] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-cyan-400" />
                Conversion Funnel Comparison
              </h2>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-emerald-300">■ Variant A</span>
                <span className="text-cyan-300">■ Variant B</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
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
                  <div className="flex items-center justify-between text-slate-300">
                    <span>{row.stage}</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      A: {row.aVal} ({row.aPct}%) · B: {row.bVal} ({row.bPct}%)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
                      <div
                        style={{ width: `${row.aPct}%` }}
                        className="h-full bg-emerald-400 transition-all duration-500"
                      />
                    </div>
                    <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
                      <div
                        style={{ width: `${row.bPct}%` }}
                        className="h-full bg-cyan-400 transition-all duration-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2nd Multivariate Experiment: rewrite_unlock_flow */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-[#0d1018] p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">
                  Experiment 2 · Unlock Gate
                </h2>
                <code className="rounded bg-slate-900 border border-slate-700 px-2 py-0.5 font-mono text-[10px] text-orange-300">
                  rewrite_unlock_flow
                </code>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Measures whether instant rewrite reveal converts better than an explicit unlock button.
              </p>
            </div>

            <div className="space-y-2.5">
              {scoreboard.unlockExperiment.variants.map((uv) => {
                const isWinner =
                  uv.variant === scoreboard.unlockExperiment.leadingVariant;
                return (
                  <div
                    key={uv.variant}
                    className={`rounded-xl border p-3.5 space-y-2 ${
                      isWinner
                        ? "border-cyan-500/40 bg-cyan-950/15"
                        : "border-slate-800 bg-slate-950/60"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-100">
                        {uv.label}{" "}
                        <code className="font-mono text-[10px] text-slate-400">
                          ({uv.variant})
                        </code>
                      </span>
                      <span className="font-mono font-bold text-cyan-300">
                        {(uv.chanceToWin * 100).toFixed(1)}% Win
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
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
          <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-[#0d1018] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" />
              Traffic Split &amp; Flag Controls
            </h2>
            <p className="text-xs text-slate-400">
              Shift traffic weights dynamically or promote the winning variant to 100% of visitors.
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
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                    store.weights.brutal_checklist === preset.val
                      ? "border-orange-500 bg-orange-500/20 text-orange-200"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
              <span className="text-slate-400">
                Flag 3: <code className="text-slate-200">live_scoreboard_enabled</code>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={handleToggleScoreboardFlag}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                  store.scoreboardEnabled
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                    : "border-slate-700 bg-slate-900 text-slate-400"
                }`}
              >
                <Eye className="h-3 w-3" />
                {store.scoreboardEnabled ? "Enabled (Visible)" : "Disabled"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-[#0d1018] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                Segment Breakdown (Flagsmith Traits)
              </h2>
              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSegmentTab("input")}
                  className={`rounded-md px-2.5 py-1 cursor-pointer ${
                    segmentTab === "input"
                      ? "bg-orange-500 text-slate-950 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  By Input Type
                </button>
                <button
                  type="button"
                  onClick={() => setSegmentTab("experience")}
                  className={`rounded-md px-2.5 py-1 cursor-pointer ${
                    segmentTab === "experience"
                      ? "bg-orange-500 text-slate-950 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  By Experience Level
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-4 font-medium">Segment</th>
                    <th className="py-2 pr-4 font-medium">Brutal Checklist Copy %</th>
                    <th className="py-2 font-medium">Guided Coach Copy %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {activeSegments.map((c) => (
                    <tr key={c.cohortKey}>
                      <td className="py-2.5 pr-4 font-medium text-slate-200">
                        {c.label}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-emerald-300">
                        {(c.brutalCopyRate * 100).toFixed(1)}%{" "}
                        <span className="text-slate-500">({c.brutalExposures})</span>
                      </td>
                      <td className="py-2.5 font-mono text-cyan-300">
                        {(c.coachCopyRate * 100).toFixed(1)}%{" "}
                        <span className="text-slate-500">({c.coachExposures})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Live Submission Feed */}
        <div className="rounded-2xl border border-slate-800 bg-[#0d1018] p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">
            Recent Anonymized Roast Sessions
          </h2>
          {store.recentFeed.length === 0 ? (
            <p className="text-xs text-slate-400">
              No sessions logged yet. Run a roast in the Arena or simulate sessions above.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {store.recentFeed.slice(0, 9).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-orange-300">{item.variant}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                          item.trafficSource === "live"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {item.trafficSource === "live" ? "Live" : "Sim"}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-200">
                      {item.score}/100
                    </span>
                  </div>
                  <div className="text-slate-400">
                    {item.inputType} · {item.experienceLevel}
                    {item.role ? ` · ${item.role}` : ""}
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span
                      className={
                        item.copiedRewrite ? "text-emerald-400" : "text-slate-500"
                      }
                    >
                      {item.copiedRewrite ? "Copied Rewrite" : "Viewed Only"}
                    </span>
                    {item.rating && (
                      <span className="text-amber-300">{item.rating} ★</span>
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
