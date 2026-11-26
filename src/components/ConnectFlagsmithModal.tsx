"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import type { ConnectionStatusPublic } from "@/lib/types";

interface ConnectFlagsmithModalProps {
  onClose: () => void;
  connection: ConnectionStatusPublic;
  onUpdated: () => Promise<void>;
  onReset: (mode: "baseline" | "zero") => Promise<void>;
}

export function ConnectFlagsmithModal({
  onClose,
  connection,
  onUpdated,
  onReset,
}: ConnectFlagsmithModalProps) {
  const [publicFlagsmithEnvKey, setPublicFlagsmithEnvKey] = useState(
    connection.publicFlagsmithEnvKey
  );
  const [flagsmithProjectId, setFlagsmithProjectId] = useState(
    connection.flagsmithProjectId
  );
  const [flagsmithApiKey, setFlagsmithApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const body: Record<string, string> = {
        publicFlagsmithEnvKey,
        flagsmithProjectId,
      };
      if (flagsmithApiKey.trim()) body.flagsmithApiKey = flagsmithApiKey.trim();
      if (geminiApiKey.trim()) body.geminiApiKey = geminiApiKey.trim();
      if (openaiApiKey.trim()) body.openaiApiKey = openaiApiKey.trim();
      if (anthropicApiKey.trim()) body.anthropicApiKey = anthropicApiKey.trim();

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || "Save failed");
      await onUpdated();
      setStatus("Saved! Flagsmith SDK & AI provider settings updated.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const handleProvision = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "provision_flags",
          flagsmithApiKey: flagsmithApiKey.trim() || undefined,
          flagsmithProjectId: flagsmithProjectId.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        created?: string[];
        skippedOrExisting?: string[];
        errors?: Array<{ name: string; message: string }>;
        error?: string;
      };
      if (json.error) throw new Error(json.error);

      await onUpdated();
      const parts = [
        `Created: ${json.created?.join(", ") || "none"}`,
        `Existing: ${json.skippedOrExisting?.join(", ") || "none"}`,
      ];
      if (json.errors && json.errors.length > 0) {
        parts.push(
          `Errors: ${json.errors.map((e) => `${e.name} (${e.message})`).join("; ")}`
        );
      }
      setStatus(`Flagsmith Cloud sync complete. ${parts.join(" · ")}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Provisioning error");
    } finally {
      setBusy(false);
    }
  };

  const canProvision =
    connection.hasManagementKey ||
    (Boolean(flagsmithApiKey.trim()) && Boolean(flagsmithProjectId.trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-[#0d1018] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-orange-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Connect Flagsmith Experimentation &amp; AI
              </h2>
              <p className="text-xs text-slate-400">
                Plug in your Flagsmith Cloud keys to send live exposure &amp; conversion events.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <label className="block space-y-1 text-xs">
            <span className="font-medium text-slate-300">
              Flagsmith Client Environment Key (<code>NEXT_PUBLIC_FLAGSMITH_ENV_KEY</code>)
            </span>
            <input
              type="text"
              placeholder="e.g. ser.xxx or client-side env key"
              value={publicFlagsmithEnvKey}
              onChange={(e) => setPublicFlagsmithEnvKey(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
            />
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-300">
                Flagsmith Project ID (optional)
              </span>
              <input
                type="text"
                placeholder="e.g. 12345"
                value={flagsmithProjectId}
                onChange={(e) => setFlagsmithProjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-300">
                Org API Token {connection.hasManagementKey ? "(Saved)" : "(optional)"}
              </span>
              <input
                type="password"
                placeholder="fs_org_..."
                value={flagsmithApiKey}
                onChange={(e) => setFlagsmithApiKey(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 border-t border-slate-800 pt-3">
            <label className="block space-y-1 text-xs">
              <span className="text-slate-400">
                Gemini Key {connection.hasGeminiKey ? "✓" : "(opt)"}
              </span>
              <input
                type="password"
                placeholder="AIza..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-slate-400">
                OpenAI Key {connection.hasOpenAiKey ? "✓" : "(opt)"}
              </span>
              <input
                type="password"
                placeholder="sk-..."
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-slate-400">
                Anthropic Key {connection.hasAnthropicKey ? "✓" : "(opt)"}
              </span>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
              />
            </label>
          </div>

          {/* Flagsmith Experimentation Setup Checklist */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1.5 text-[11px] text-slate-300">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Flagsmith Experimentation Metric Checklist (Track 01)
            </div>
            <p className="text-slate-400">
              In Flagsmith Cloud → Experimentation, create metrics matching exact SDK event names:
            </p>
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
              <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-emerald-300">
                rewrite_copied (Primary)
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                roast_completed
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                feedback_helpful (Mean)
              </span>
              <span className="rounded bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-cyan-300">
                $flag_exposure (Auto)
              </span>
            </div>
          </div>

          {status && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
              {status}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onReset("zero")}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1.5 text-[11px] text-rose-200 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                Zero Counts (Go Live)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReset("baseline")}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-[11px] text-slate-300 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                Seed Baseline
              </button>
            </div>

            <div className="flex items-center gap-2">
              {canProvision && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleProvision}
                  className="inline-flex items-center gap-1 rounded-lg border border-orange-500/40 bg-orange-500/15 hover:bg-orange-500/25 px-3 py-1.5 text-xs font-medium text-orange-200 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Provision Flags
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-slate-950 cursor-pointer"
              >
                {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
