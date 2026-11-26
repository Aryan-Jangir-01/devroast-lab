import type {
  ExperienceLevel,
  GuidedCoachStep,
  InputType,
  RedFlagItem,
  RoastAnalysisResult,
  RuntimeConfigInternal,
} from "@/lib/types";

const WEAK_PHRASES = [
  "worked on",
  "helped with",
  "responsible for",
  "assisted in",
  "was part of",
  "made a",
  "created a",
  "did some",
  "various",
  "etc",
];

const STRONG_VERBS = [
  "architected",
  "engineered",
  "built",
  "reduced",
  "accelerated",
  "launched",
  "automated",
  "scaled",
  "designed",
  "cut",
  "shipped",
  "optimized",
  "spearheaded",
];

const TECH_DICTIONARY: Array<{ label: string; pattern: RegExp }> = [
  { label: "Next.js", pattern: /\bnext(\.js|js)?\b/i },
  { label: "React", pattern: /\breact\b/i },
  { label: "TypeScript", pattern: /\btypescript|\bts\b/i },
  { label: "JavaScript", pattern: /\bjavascript|\bjs\b/i },
  { label: "Node.js", pattern: /\bnode(\.js|js)?\b/i },
  { label: "Python", pattern: /\bpython\b/i },
  { label: "FastAPI", pattern: /\bfastapi\b/i },
  { label: "Django", pattern: /\bdjango\b/i },
  { label: "Go", pattern: /\bgolang\b/i },
  { label: "Rust", pattern: /\brust\b/i },
  { label: "PostgreSQL", pattern: /\bpostgres(ql)?\b/i },
  { label: "MongoDB", pattern: /\bmongo(db)?\b/i },
  { label: "Redis", pattern: /\bredis\b/i },
  { label: "Docker", pattern: /\bdocker\b/i },
  { label: "AWS", pattern: /\baws\b/i },
  { label: "Tailwind CSS", pattern: /\btailwind\b/i },
  { label: "Flagsmith", pattern: /\bflagsmith\b/i },
  { label: "GraphQL", pattern: /\bgraphql\b/i },
  { label: "Prisma", pattern: /\bprisma\b/i },
  { label: "Vercel", pattern: /\bvercel\b/i },
];

function clamp(n: number, min = 10, max = 98): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function detectMetrics(text: string): number {
  const matches = text.match(
    /(\d+(\.\d+)?\s*(%|ms|s|x|k|m|\+|users|req\/s|rps|mins?|secs?)|\$\d+)/gi
  );
  return matches ? matches.length : 0;
}

function detectTechStack(text: string): string[] {
  return TECH_DICTIONARY.filter((item) => item.pattern.test(text)).map(
    (item) => item.label
  );
}

function trimOnWordBoundary(text: string, maxLen: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).replace(/[.,;:]+$/, "");
}

function rewriteResumeBullets(lines: string[], level: ExperienceLevel): string {
  const nonEmpty = lines.filter((l) => l.trim().length > 4).slice(0, 6);
  if (nonEmpty.length === 0) {
    return "• Architected end-to-end feature delivery pipeline, reducing release regressions by 42% across 10k+ weekly sessions.";
  }

  const verbBank =
    level === "senior"
      ? ["Architected", "Spearheaded", "Reduced", "Scaled", "Engineered"]
      : level === "mid"
        ? ["Engineered", "Built", "Optimized", "Automated", "Reduced"]
        : ["Built", "Engineered", "Automated", "Shipped", "Streamlined"];

  return nonEmpty
    .map((raw, idx) => {
      const cleaned = raw.replace(/^[-•*\d.)\s]+/, "").trim();
      const withoutWeak = cleaned.replace(
        /^(worked on|helped with|responsible for|assisted in|was part of|made a|made|created a|created|did some|did)\s+/i,
        ""
      );
      const startsWithStrong = STRONG_VERBS.some((v) =>
        withoutWeak.toLowerCase().startsWith(v)
      );
      const hasNumber = /\d/.test(withoutWeak);
      const verb = verbBank[idx % verbBank.length];
      const core = startsWithStrong
        ? withoutWeak.charAt(0).toUpperCase() + withoutWeak.slice(1)
        : `${verb} ${withoutWeak.charAt(0).toLowerCase() + withoutWeak.slice(1)}`;
      const suffix = hasNumber
        ? ""
        : " — cutting manual effort by ~35% (swap in your measured benchmark)";
      return `• ${core.replace(/\.$/, "")}${suffix}.`;
    })
    .join("\n");
}

function rewriteReadme(
  text: string,
  role: string,
  detectedStack: string[]
): string {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const firstLine =
    rawLines
      .find((l) => l.length > 2)
      ?.replace(/^#+\s*/, "")
      .trim() || "Project Name";

  const bulletCandidates = rawLines
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 4);

  const summarySentence =
    rawLines.find((l) => !l.startsWith("#") && !/^[-*•`]/.test(l) && l.length > 20) ||
    `Developer-first tool tailored for ${role} workflows with predictable setup and measurable speed.`;

  const hasInstall = /install|npm\s+i|pip\s+install|docker|quickstart/i.test(text);
  const stackLine =
    detectedStack.length > 0
      ? detectedStack.join(" · ")
      : "TypeScript · Node.js (update with your core stack)";

  const capabilityLines =
    bulletCandidates.length > 0
      ? bulletCandidates.map(
          (item) =>
            `- **${item.charAt(0).toUpperCase() + item.slice(1).replace(/\.$/, "")}:** Built for zero-friction developer execution with verifiable output.`
        )
      : [
          "- **Core Workflow:** Eliminates manual context switching in under 60 seconds.",
          "- **Reliable Setup:** Deterministic environment config and automated test coverage.",
        ];

  return [
    `# ${firstLine}`,
    ``,
    `> ${trimOnWordBoundary(summarySentence, 150)} — engineered to deliver measurable workflow speed and zero-friction onboarding.`,
    ``,
    `**Tech Stack:** ${stackLine}`,
    ``,
    `## Key Capabilities`,
    ...capabilityLines,
    ``,
    `## Quickstart (< 60s)`,
    hasInstall
      ? "```bash\n# Copy-paste ready commands\nnpm install && cp .env.example .env.local\nnpm run dev\n```"
      : "```bash\ngit clone https://github.com/your-org/project.git\ncd project\ncp .env.example .env.local\nnpm install && npm run dev\n```",
    ``,
    `## Verification & Live Demo`,
    `- Run \`npm test && npm run build\` before pushing.`,
    `- Embed a 30-second GIF or architecture diagram above the fold for instant judge/recruiter clarity.`,
  ].join("\n");
}

function rewritePitch(
  text: string,
  role: string,
  detectedStack: string[]
): string {
  const core = trimOnWordBoundary(text, 165).replace(/\.$/, "");
  const stackSuffix =
    detectedStack.length > 0 ? ` Powered by ${detectedStack.slice(0, 3).join(", ")}.` : "";
  return `Built for ${role} teams tired of slow, guesswork-heavy workflows: ${core.charAt(0).toLowerCase() + core.slice(1)} — cutting turnaround time by 40%+ with verifiable before/after metrics.${stackSuffix}`;
}

function buildDeterministicRoast(params: {
  text: string;
  inputType: InputType;
  role: string;
  experienceLevel: ExperienceLevel;
}): RoastAnalysisResult {
  const { text, inputType, role, experienceLevel } = params;
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const metricCount = detectMetrics(trimmed);
  const detectedStack = detectTechStack(trimmed);

  const lower = trimmed.toLowerCase();
  const weakFound = WEAK_PHRASES.filter((p) => lower.includes(p));
  const strongFound = STRONG_VERBS.filter((v) => lower.includes(v));

  let impactScore =
    38 + Math.min(metricCount * 16, 48) + Math.min(strongFound.length * 5, 12);
  impactScore -= weakFound.length * 10;

  let clarityScore = 52 + (wordCount >= 25 && wordCount <= 260 ? 18 : 4);
  if (lines.length >= 3) clarityScore += 12;
  if (wordCount < 15) clarityScore -= 20;

  let actionabilityScore = 45;
  if (inputType === "github_readme") {
    const hasHeading = /^#+\s+/m.test(trimmed);
    const hasCodeBlock = /```/.test(trimmed);
    const hasSetup = /install|setup|quickstart|usage|env/i.test(trimmed);
    const hasDemo = /demo|screenshot|video|live/i.test(trimmed);
    actionabilityScore =
      30 +
      (hasHeading ? 15 : 0) +
      (hasCodeBlock ? 20 : 0) +
      (hasSetup ? 20 : 0) +
      (hasDemo ? 12 : 0);
  } else if (inputType === "resume_bullets") {
    actionabilityScore = 42 + strongFound.length * 11 - weakFound.length * 12;
  } else {
    const hasWho = /for\s+\w+|developers|teams|engineers|users|students/i.test(trimmed);
    const hasOutcome =
      metricCount > 0 || /save|faster|reduce|automate|cut|improve/i.test(trimmed);
    actionabilityScore = 40 + (hasWho ? 22 : 0) + (hasOutcome ? 25 : 0);
  }

  let readabilityScore = 62;
  const avgLineWords = lines.length > 0 ? wordCount / lines.length : wordCount;
  if (avgLineWords > 42) readabilityScore -= 22;
  else if (avgLineWords <= 24 && lines.length >= 2) readabilityScore += 20;

  impactScore = clamp(impactScore);
  clarityScore = clamp(clarityScore);
  actionabilityScore = clamp(actionabilityScore);
  readabilityScore = clamp(readabilityScore);

  const overallScore = Math.round(
    impactScore * 0.34 +
      clarityScore * 0.24 +
      actionabilityScore * 0.24 +
      readabilityScore * 0.18
  );

  const redFlags: RedFlagItem[] = [];
  const sampleLine = lines.find((l) => !l.startsWith("#")) ?? lines[0] ?? trimmed;

  if (metricCount === 0) {
    redFlags.push({
      id: "missing-metrics",
      severity: "high",
      title: "Zero quantified impact detected",
      detail:
        "Recruiters and hackathon judges skim for numbers (%, ms latency, users, conversion lift). Pure qualitative claims lose trust fast.",
      beforeSnippet: trimOnWordBoundary(sampleLine, 92),
      afterSnippet: `${trimOnWordBoundary(sampleLine, 64)} — cutting latency by 38% across 2k+ weekly sessions`,
    });
  }

  if (weakFound.length > 0) {
    const weakLine =
      lines.find((l) => weakFound.some((w) => l.toLowerCase().includes(w))) ??
      sampleLine;
    redFlags.push({
      id: "weak-verbs",
      severity: "high",
      title: `Passive phrasing spotted: "${weakFound.slice(0, 2).join('", "')}"`,
      detail: `For a ${experienceLevel} ${role} profile, lead every bullet with an ownership verb (Architected, Engineered, Automated, Reduced).`,
      beforeSnippet: trimOnWordBoundary(weakLine, 92),
      afterSnippet: `Engineered ${trimOnWordBoundary(
        weakLine.replace(/^[-•*\s]+/, "").replace(new RegExp(weakFound[0], "i"), "").trim(),
        68
      )} with measurable SLA gains`,
    });
  }

  if (inputType === "github_readme" && !/```/.test(trimmed)) {
    redFlags.push({
      id: "no-quickstart-code",
      severity: "high",
      title: "No copy-paste Quickstart code block",
      detail:
        "Evaluators spend <30 seconds on a README. Without fenced bash install/run steps, setup friction drops adoption drastically.",
      beforeSnippet: "Features: - Sync tasks - Easy to use - Fast",
      afterSnippet: "```bash\ngit clone ... && npm install && npm run dev\n```",
    });
  }

  if (avgLineWords > 42) {
    redFlags.push({
      id: "wall-of-text",
      severity: "medium",
      title: "Dense wall-of-text paragraphs",
      detail: `Average block length is ~${Math.round(avgLineWords)} words. Break into crisp 1–2 line scannable bullets.`,
    });
  }

  if (redFlags.length === 0) {
    redFlags.push({
      id: "strong-baseline",
      severity: "tip",
      title: "Solid structure — sharpen competitive hook",
      detail:
        "Your fundamentals look clean. Emphasize your sharpest before/after benchmark right in the opening line.",
    });
  }

  const rewrittenText =
    inputType === "github_readme"
      ? rewriteReadme(trimmed, role, detectedStack)
      : inputType === "resume_bullets"
        ? rewriteResumeBullets(lines, experienceLevel)
        : rewritePitch(trimmed, role, detectedStack);

  const checklistFixes: string[] = [
    metricCount === 0
      ? "Add at least 2 concrete numbers (%, ms latency, users, or hours saved)."
      : `Keep your ${metricCount} metric anchor(s) bolded near the start of bullets.`,
    weakFound.length > 0
      ? `Replace "${weakFound[0]}" with a strong ownership verb like "Architected" or "Engineered".`
      : "Lead each bullet with Outcome → Action → Tech Stack.",
    inputType === "github_readme"
      ? "Include a 3-step copy-paste Quickstart block + .env variables section."
      : `Tailor terminology explicitly for ${role} reviewers (${experienceLevel} bar).`,
    "Trim filler adjectives ('various', 'easy', 'fast') and cap bullets at 2 lines.",
  ];

  const guidedSteps: GuidedCoachStep[] = [
    {
      stepNumber: 1,
      title: "Hook & Audience Calibration",
      diagnosticPrompt: `If a ${role} hiring manager or judge reads only your first line for 5 seconds, what concrete outcome should stick?`,
      coachTip:
        "Move your highest-leverage problem or outcome to line 1. Skip generic 'A tool I made...' intros.",
      exampleImprovement:
        inputType === "github_readme"
          ? "# TaskSync CLI — Cut cross-tool issue triage from 15 mins to 30 secs"
          : "• Reduced API p95 latency 44% (380ms -> 210ms) for 12k daily requests",
      quickChips: [
        "Latency / Speed Focus",
        "Developer Productivity Focus",
        "Conversion / Growth Focus",
      ],
      inputPlaceholder: "Optional: your target 1-line hook (e.g. Cuts setup from 20m to 45s)",
    },
    {
      stepNumber: 2,
      title: "Proof & Quantification Pass",
      diagnosticPrompt:
        metricCount === 0
          ? "Which exact metric (latency, accuracy, active users, conversion %, time saved) improved because of your work?"
          : "Pair your existing numbers with baseline context (Before -> After) so reviewers trust the delta.",
      coachTip:
        "Even small-scale benchmarks ('tested on 500 records' or 'cut build time from 45s to 12s') outperform vague adjectives.",
      exampleImprovement:
        "Replaced naive polling with webhook stream, reducing DB reads by 68%.",
      quickChips: [
        "42% faster workflow",
        "1,200+ weekly sessions",
        "p95 latency 380ms → 140ms",
      ],
      inputPlaceholder: "Optional: enter your real metric (e.g. 38% faster, 500+ users)",
    },
    {
      stepNumber: 3,
      title: "Zero-Friction Actionability",
      diagnosticPrompt:
        inputType === "github_readme"
          ? "Can a stranger clone and run your app locally in under 60 seconds without guessing env vars?"
          : "Does every bullet prove engineering ownership rather than just listing frameworks?",
      coachTip: "Pair each tech choice with *why* it mattered in production.",
      exampleImprovement:
        "Added one-command setup + automated Vitest smoke checks in CI.",
      quickChips: [
        "Under-60s Quickstart",
        "Production Reliability & Tests",
        "Staff-Level Ownership Tone",
      ],
      inputPlaceholder: "Optional: final callout to append to your rewrite",
    },
  ];

  let verdictBadge = "Needs Sharper Proof";
  let roastHeadline =
    "Good raw material, but reviewers will skim past vague phrasing.";
  if (overallScore >= 80) {
    verdictBadge = "Ship-Ready";
    roastHeadline =
      "High-signal engineering copy — tight polish will push this top 5%.";
  } else if (overallScore < 55) {
    verdictBadge = "High Bounce Risk";
    roastHeadline =
      "Too vague right now — lacks hard metrics and scannable structure.";
  }

  return {
    overallScore,
    verdictBadge,
    roastHeadline,
    metricsBreakdown: {
      impactScore,
      clarityScore,
      actionabilityScore,
      readabilityScore,
    },
    detectedStack,
    redFlags,
    checklistFixes,
    guidedSteps,
    rewrittenText,
    engineSource: "DevRoast Rubric Engine",
  };
}

function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function analyzeSubmission(params: {
  text: string;
  inputType: InputType;
  role: string;
  experienceLevel: ExperienceLevel;
  config: RuntimeConfigInternal;
}): Promise<RoastAnalysisResult> {
  const baseline = buildDeterministicRoast(params);

  const systemPrompt =
    "You are DevRoast Lab, a blunt but constructive staff-engineer reviewer. " +
    "Analyze the developer's submission and output valid JSON with keys: " +
    "roastHeadline (string), verdictBadge (string), overallScore (number 10-98), " +
    "checklistFixes (array of 4 strings), " +
    "redFlags (array of up to 3 objects with id, severity ('high'|'medium'|'tip'), title, detail, beforeSnippet, afterSnippet), " +
    "rewrittenText (string improving their exact submission while keeping real project details).";

  const userPrompt =
    `Input Type: ${params.inputType}\nRole: ${params.role} (${params.experienceLevel})\n` +
    `Content:\n${params.text.slice(0, 4000)}`;

  try {
    let raw: string | null = null;
    let engineSource = baseline.engineSource;

    if (params.config.geminiApiKey.trim()) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(params.config.geminiApiKey.trim())}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.35,
            },
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        engineSource = "Gemini 2.5 Flash";
      }
    } else if (params.config.openaiApiKey.trim()) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.config.openaiApiKey.trim()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.35,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        raw = data.choices?.[0]?.message?.content ?? null;
        engineSource = "OpenAI GPT-4o-mini";
      }
    } else if (params.config.anthropicApiKey.trim()) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": params.config.anthropicApiKey.trim(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 1200,
          temperature: 0.35,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          content?: Array<{ type?: string; text?: string }>;
        };
        raw =
          data.content?.find((c) => c.type === "text")?.text ??
          data.content?.[0]?.text ??
          null;
        engineSource = "Claude 3.5 Haiku";
      }
    }

    if (!raw) return baseline;
    const parsed = extractJson(raw);
    if (!parsed) return baseline;

    const llmRedFlags: RedFlagItem[] = Array.isArray(parsed.redFlags)
      ? parsed.redFlags
          .slice(0, 4)
          .map((item, idx): RedFlagItem | null => {
            if (!item || typeof item !== "object") return null;
            const obj = item as Record<string, unknown>;
            if (typeof obj.title !== "string" || typeof obj.detail !== "string") {
              return null;
            }
            const sev =
              obj.severity === "high" ||
              obj.severity === "medium" ||
              obj.severity === "tip"
                ? obj.severity
                : "medium";
            return {
              id:
                typeof obj.id === "string" && obj.id.trim()
                  ? obj.id.trim()
                  : `llm-flag-${idx}`,
              severity: sev,
              title: obj.title.trim(),
              detail: obj.detail.trim(),
              beforeSnippet:
                typeof obj.beforeSnippet === "string" && obj.beforeSnippet.trim()
                  ? obj.beforeSnippet.trim()
                  : undefined,
              afterSnippet:
                typeof obj.afterSnippet === "string" && obj.afterSnippet.trim()
                  ? obj.afterSnippet.trim()
                  : undefined,
            };
          })
          .filter((x): x is RedFlagItem => x !== null)
      : [];

    const overallScore =
      typeof parsed.overallScore === "number" && Number.isFinite(parsed.overallScore)
        ? clamp(parsed.overallScore)
        : baseline.overallScore;

    return {
      ...baseline,
      overallScore,
      roastHeadline:
        typeof parsed.roastHeadline === "string" && parsed.roastHeadline.trim()
          ? parsed.roastHeadline.trim()
          : baseline.roastHeadline,
      verdictBadge:
        typeof parsed.verdictBadge === "string" && parsed.verdictBadge.trim()
          ? parsed.verdictBadge.trim()
          : baseline.verdictBadge,
      redFlags: llmRedFlags.length > 0 ? llmRedFlags : baseline.redFlags,
      checklistFixes:
        Array.isArray(parsed.checklistFixes) && parsed.checklistFixes.length >= 2
          ? parsed.checklistFixes.map((x) => String(x)).slice(0, 5)
          : baseline.checklistFixes,
      rewrittenText:
        typeof parsed.rewrittenText === "string" && parsed.rewrittenText.trim()
          ? parsed.rewrittenText.trim()
          : baseline.rewrittenText,
      engineSource,
    };
  } catch {
    return baseline;
  }
}
