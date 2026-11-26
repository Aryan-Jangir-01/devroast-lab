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
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-zinc-800 bg-[#0b0b0e] shadow-2xl flex flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#f5c518]/30 bg-[#f5c518]/10 text-[#f5c518]">
            <Activity className="h-3.5 w-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Flagsmith SDK Inspector
            </h2>
            <p className="text-[11px] text-zinc-500">
              Live evaluations, traits &amp; flushed events
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 cursor-pointer"
          aria-label="Close Flagsmith Inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        {/* Connection & Identity */}
        <div className="rounded-lg border border-zinc-800 bg-[#111115] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 font-medium">Pipeline Mode</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${
                connection.mode === "live_flagsmith"
                  ? "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300"
              }`}
            >
              <Radio className="h-2.5 w-2.5" />
              {connection.mode === "live_flagsmith"
                ? "Live Flagsmith Edge"
                : "Local Hydrated IState"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-zinc-800/80 bg-[#09090b] p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
                Identity
              </span>
              <code className="font-mono text-[11px] text-zinc-100 break-all">
                {visitorId}
              </code>
            </div>
            <div className="rounded-md border border-zinc-800/80 bg-[#09090b] p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
                Engine / Store
              </span>
              <code className="font-mono text-[11px] text-zinc-300">
                {connection.activeLlmProvider} · {connection.storageBackend}
              </code>
            </div>
          </div>

          <div className="rounded-md border border-zinc-800/80 bg-[#09090b] p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
              identify() Traits
            </span>
            <pre className="font-mono text-[11px] text-zinc-300 overflow-x-auto leading-relaxed">
              {JSON.stringify(traits, null, 2)}
            </pre>
          </div>
        </div>

        {/* Evaluated Flags */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Evaluated Flags
          </h3>
          <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-[#111115]">
            {flagsSnapshot.map((flag) => (
              <div
                key={flag.key}
                className="p-3 flex items-center justify-between gap-2"
              >
                <div>
                  <code className="font-mono text-[11px] font-medium text-zinc-100">
                    {flag.key}
                  </code>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] text-zinc-500">
                      enabled={String(flag.enabled)}
                    </span>
                    {flag.inExperiment && (
                      <span className="inline-flex items-center gap-1 rounded border border-[#f5c518]/30 bg-[#f5c518]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#f5c518]">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        inExperiment
                      </span>
                    )}
                  </div>
                </div>
                <span className="rounded border border-zinc-700 bg-[#09090b] px-2 py-1 font-mono text-[11px] text-[#f5c518]">
                  {flag.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Event Stream */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Event Stream ({logs.length})
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onFlushNow}
                className="inline-flex items-center gap-1 rounded border border-[#f5c518]/40 bg-[#f5c518]/15 hover:bg-[#f5c518]/25 px-2.5 py-1 text-[10px] font-semibold text-[#f5c518] cursor-pointer"
              >
                <Send className="h-3 w-3" />
                Flush Now
              </button>
              <button
                type="button"
                onClick={onClearLogs}
                className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800 p-5 text-center text-[11px] text-zinc-500">
              Run a roast, copy a rewrite, or rate helpfulness to inspect Flagsmith SDK payloads.
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-zinc-800 bg-[#111115] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded border border-zinc-700 bg-[#09090b] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#f5c518]">
                      {entry.kind}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] font-semibold text-zinc-100">
                    {entry.name}
                  </div>
                  <p className="text-[11px] text-zinc-400">{entry.detail}</p>
                  <pre className="rounded border border-zinc-800/80 bg-[#09090b] p-2 font-mono text-[10px] text-zinc-300 overflow-x-auto">
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
