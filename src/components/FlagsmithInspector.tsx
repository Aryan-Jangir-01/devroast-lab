"use client";

import { Activity, CheckCircle2, Radio, Send, Trash2, X } from "lucide-react";
import type {
  ConnectionStatusPublic,
  FlagsmithEventLogEntry,
  VisitorTraits,
} from "@/lib/types";

interface FlagsmithInspectorProps {
  open: boolean;
  onClose: () => void;
  connection: ConnectionStatusPublic;
  visitorId: string;
  traits: VisitorTraits;
  flagsSnapshot: Array<{
    key: string;
    enabled: boolean;
    value: string;
    inExperiment: boolean;
  }>;
  logs: FlagsmithEventLogEntry[];
  onFlushNow: () => Promise<void>;
  onClearLogs: () => void;
}

export function FlagsmithInspector({
  open,
  onClose,
  connection,
  visitorId,
  traits,
  flagsSnapshot,
  logs,
  onFlushNow,
  onClearLogs,
}: FlagsmithInspectorProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-slate-800 bg-[#0a0d14]/98 backdrop-blur-xl shadow-2xl flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Flagsmith SDK Live Inspector
            </h2>
            <p className="text-[11px] text-slate-400">
              Real-time flag evaluations, traits &amp; experimentation events
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 cursor-pointer"
          aria-label="Close Flagsmith Inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        {/* Connection & Identity */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">SDK Pipeline Mode</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold ${
                connection.mode === "live_flagsmith"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              }`}
            >
              <Radio className="h-3 w-3" />
              {connection.mode === "live_flagsmith"
                ? "Live Flagsmith Edge"
                : "Local Hydrated IState"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-lg border border-slate-800 bg-[#07080d] p-2">
              <span className="text-[10px] text-slate-500 block">Identity</span>
              <code className="font-mono text-[11px] text-cyan-300 break-all">
                {visitorId}
              </code>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#07080d] p-2">
              <span className="text-[10px] text-slate-500 block">AI / Storage</span>
              <code className="font-mono text-[11px] text-slate-200">
                {connection.activeLlmProvider} · {connection.storageBackend}
              </code>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-[#07080d] p-2.5">
            <span className="text-[10px] text-slate-500 block mb-1">
              Traits Passed to flagsmith.identify()
            </span>
            <pre className="font-mono text-[10px] text-slate-300 overflow-x-auto">
              {JSON.stringify(traits, null, 2)}
            </pre>
          </div>
        </div>

        {/* Evaluated Flags */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Active Evaluated Flags
          </h3>
          <div className="space-y-2">
            {flagsSnapshot.map((flag) => (
              <div
                key={flag.key}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex items-center justify-between gap-2"
              >
                <div>
                  <code className="font-mono text-[11px] font-semibold text-slate-100">
                    {flag.key}
                  </code>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-400">
                      enabled: {String(flag.enabled)}
                    </span>
                    {flag.inExperiment && (
                      <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        inExperiment
                      </span>
                    )}
                  </div>
                </div>
                <span className="rounded-lg border border-orange-500/35 bg-orange-500/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-orange-300">
                  {flag.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Event Stream */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              SDK Event Stream ({logs.length})
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onFlushNow}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2 py-1 text-[10px] font-semibold text-emerald-200 cursor-pointer"
              >
                <Send className="h-3 w-3" />
                Flush Events
              </button>
              <button
                type="button"
                onClick={onClearLogs}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2 py-1 text-[10px] text-slate-300 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-[11px] text-slate-500">
              Run a roast, copy a rewrite, or rate helpfulness to inspect live Flagsmith SDK events.
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                      {entry.kind}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] font-semibold text-slate-100">
                    {entry.name}
                  </div>
                  <p className="text-[11px] text-slate-400">{entry.detail}</p>
                  <pre className="rounded bg-[#07080d] p-2 font-mono text-[10px] text-slate-300 overflow-x-auto">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
