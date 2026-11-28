"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import type { ConnectionStatusPublic } from "@/lib/types";

import {
  buildAdminHeaders,
  getStoredAdminKey,
  setStoredAdminKey,
} from "@/lib/auth/clientAdmin";

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
  const [adminPasscode, setAdminPasscode] = useState(() => getStoredAdminKey());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      if (adminPasscode.trim()) {
        setStoredAdminKey(adminPasscode.trim());
      }
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
        headers: buildAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || "Save failed");
      await onUpdated();
      setStatus("Saved! Flagsmith SDK & provider settings updated.");
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
      if (adminPasscode.trim()) {
        setStoredAdminKey(adminPasscode.trim());
      }
      const res = await fetch("/api/config", {
        method: "POST",
        headers: buildAdminHeaders({ "Content-Type": "application/json" }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-xl border border-zinc-800 bg-[#0d0d10] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#f5c518]/30 bg-[#f5c518]/10 text-[#f5c518]">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Flagsmith &amp; Model Configuration
              </h2>
              <p className="text-xs text-zinc-500">
                Connect Flagsmith Cloud credentials for live edge evaluation &amp; metrics.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {connection.adminProtected && (
            <label className="block space-y-1.5 text-xs rounded-lg border border-[#f5c518]/30 bg-[#f5c518]/5 p-3">
              <span className="font-medium text-[#f5c518]">
                Admin Passcode (`DEVROAST_ADMIN_KEY`) Required for Setup Changes
              </span>
              <input
                type="password"
                placeholder="Enter admin passcode"
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
              />
            </label>
          )}
          <label className="block space-y-1.5 text-xs">
            <span className="font-medium text-zinc-300">
              Flagsmith Client Environment Key (
              <code className="text-[#f5c518]">NEXT_PUBLIC_FLAGSMITH_ENV_KEY</code>)
            </span>
            <input
              type="text"
              placeholder="Client-side environment key"
              value={publicFlagsmithEnvKey}
              onChange={(e) => setPublicFlagsmithEnvKey(e.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
            />
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-xs">
              <span className="font-medium text-zinc-300">
                Project ID (optional)
              </span>
              <input
                type="text"
                placeholder="e.g. 56521"
                value={flagsmithProjectId}
                onChange={(e) => setFlagsmithProjectId(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5 text-xs">
              <span className="font-medium text-zinc-300">
                Org API Token {connection.hasManagementKey ? "(Saved)" : "(optional)"}
              </span>
              <input
                type="password"
                placeholder="API access token"
                value={flagsmithApiKey}
                onChange={(e) => setFlagsmithApiKey(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 border-t border-zinc-800 pt-3">
            <label className="block space-y-1.5 text-xs">
              <span className="text-zinc-400">
                Gemini {connection.hasGeminiKey ? "· Active" : "(opt)"}
              </span>
              <input
                type="password"
                placeholder="AIza..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5 text-xs">
              <span className="text-zinc-400">
                OpenAI {connection.hasOpenAiKey ? "· Active" : "(opt)"}
              </span>
              <input
                type="password"
                placeholder="sk-..."
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5 text-xs">
              <span className="text-zinc-400">
                Anthropic {connection.hasAnthropicKey ? "· Active" : "(opt)"}
              </span>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-[#09090b] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-[#f5c518] focus:outline-none"
              />
            </label>
          </div>

          {/* Flagsmith Experimentation Setup Checklist */}
          <div className="rounded-lg border border-zinc-800 bg-[#111115] p-3 space-y-2 text-[11px] text-zinc-300">
            <div className="flex items-center gap-1.5 font-semibold text-[#f5c518]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Flagsmith Experimentation Metrics
            </div>
            <p className="text-zinc-400">
              In Flagsmith Cloud → Metrics, ensure event names match exactly:
            </p>
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
              <span className="rounded border border-[#f5c518]/40 bg-[#f5c518]/10 px-2 py-0.5 text-[#f5c518]">
                rewrite_copied (Primary)
              </span>
              <span className="rounded border border-zinc-700 bg-[#09090b] px-2 py-0.5 text-zinc-300">
                roast_completed
              </span>
              <span className="rounded border border-zinc-700 bg-[#09090b] px-2 py-0.5 text-zinc-300">
                feedback_helpful (Mean)
              </span>
              <span className="rounded border border-zinc-700 bg-[#09090b] px-2 py-0.5 text-zinc-400">
                $flag_exposure (Auto)
              </span>
            </div>
          </div>

          {status && (
            <div className="rounded-md border border-[#f5c518]/35 bg-[#f5c518]/10 px-3 py-2 text-xs text-[#fde047]">
              {status}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onReset("zero")}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#111115] hover:border-red-500/40 hover:text-red-300 px-2.5 py-1.5 text-[11px] text-zinc-300 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                Zero Counts (Go Live)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReset("baseline")}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#111115] hover:border-zinc-700 px-2.5 py-1.5 text-[11px] text-zinc-300 cursor-pointer"
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
                  className="inline-flex items-center gap-1 rounded-md border border-[#f5c518]/40 bg-[#f5c518]/10 hover:bg-[#f5c518]/20 px-3 py-1.5 text-xs font-medium text-[#f5c518] cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Provision Flags
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[#f5c518] hover:bg-[#ffd43b] disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-black cursor-pointer"
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
