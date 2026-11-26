# DevRoast Lab — GSD Engineering Roadmap (`PLAN.md`)

**Hackathon:** Toggle Wars: The Flagsmith Experimentation Hackathon (Track 01: Test Something Real — \$2,000)  
**Folder:** `d:\hackthon\devroast-lab`  
**Core Hypothesis:** Does an **Instant Brutal Checklist (`brutal_checklist`)** outperform an **Interactive Guided Coach (`guided_coach`)** for developer Resume & GitHub README optimization conversions (`rewrite_copied`, `roast_completed`, `feedback_helpful`)?

---

## Architecture & Flagsmith Integration

1. **Core Flagsmith Integration (`@flagsmith/flagsmith` v12.6.0+):**
   - `enableEvents: true` initialized on client & server SDK for native Flagsmith Experimentation event ingestion (`trackExposureEvent`, `trackEvent`).
   - `identify(visitorId, traits)` with `{ role, experience_level, input_type }` enabling Flagsmith Segments + user-level experiment bucketing.
   - Multivariate Flag 1: `roast_strategy_experiment` (`brutal_checklist` 50% vs `guided_coach` 50%).
   - Multivariate Flag 2: `rewrite_unlock_flow` (`instant_reveal` 50% vs `interactive_step` 50%).
   - Standard Flag 3: `live_scoreboard_enabled` (controls public telemetry link & live experiment badge).
2. **Dual-Mode Seamless Operation:**
   - **Live Flagsmith Mode:** When `NEXT_PUBLIC_FLAGSMITH_ENV_KEY` (and optional `FLAGSMITH_API_KEY` + `FLAGSMITH_PROJECT_ID`) is configured, evaluations & tracking events go directly to Flagsmith Edge/API + Flagsmith Experimentation Warehouse.
   - **Local Experiment Engine Fallback:** When no Flagsmith key is configured yet, deterministic hash bucketing hydrates `@flagsmith/flagsmith` via `IState` and persists real user interactions in `.devroast/experiments.json` so evaluators can test and demo immediately.
3. **Real Content Critique & Rewrite Engine:**
   - Supports **Resume Bullets**, **GitHub README.md**, and **Developer Bio / Project Pitch**.
   - Uses **Gemini / OpenAI / Anthropic** when configured, plus a deep deterministic engineering rubric analyzer (action verbs, quantified impact metrics, setup/architecture completeness, clarity score, red flags, and concrete before/after rewrites) when running without LLM keys.

---

## Phases & Verification Criteria

### Phase 1: Project Scaffold (`d:\hackthon\devroast-lab`)
- Create Next.js 16 + TypeScript + Tailwind v4 app with `@flagsmith/flagsmith`, `lucide-react`, and `vitest`.
- Configure `.gitignore`, `.env.example`, and `vitest.config.ts`.

### Phase 2: Flagsmith Experimentation, Analyzer & Bayesian Stats Engine
- `src/lib/types.ts`: Experiment, variant, trait, critique, and telemetry types.
- `src/lib/analyzer/roastEngine.ts`: Real resume/README/pitch analyzer + optional LLM enhancer producing tailored output shapes for `brutal_checklist` vs `guided_coach`.
- `src/lib/stats/bayesian.ts`: Beta-Binomial Monte Carlo Bayesian win-probability (`chanceToWin`), lift %, 95% credible intervals, and cohort segmentation breakdown.
- `src/lib/store/experimentStore.ts`: File-locked `.devroast/experiments.json` + deterministic Flagsmith `IState` hydrator + optional Flagsmith Management API sync.

### Phase 3: API Routes & Automated Tests
- `GET / POST /api/experiment/state`: Hydrate visitor Flagsmith `IState`, current flag weights, Bayesian scoreboard stats, and config status.
- `POST /api/roast`: Run real critique + rewrite tailored to visitor's assigned Flagsmith variant & traits, recording exposure.
- `POST /api/events`: Record conversion events (`roast_completed`, `rewrite_copied`, `feedback_helpful`, `time_to_copy_ms`) and optional realistic cohort traffic simulation (`simulate`) for testing.
- `POST /api/config`: Save optional Flagsmith / LLM keys safely server-side.
- Unit & route integration tests via `vitest`.

### Phase 4: DevRoast Arena & Live Scoreboard UI
- `/` (`src/app/page.tsx` + `src/components/DevRoastArena.tsx`):
  - Sleek high-craft dark UI where developers pick input type (`GitHub README`, `Resume Bullets`, `Project Pitch`), select persona traits (`role`, `experience_level`), paste real content (or pick 1-click sample), and experience their Flagsmith-assigned variant (`brutal_checklist` vs `guided_coach`) live via `FlagsmithProvider` + `useFlags` + `useFlagsmith`.
  - Real interactive copy-rewrite, step-by-step guided coach diagnostic flow, 1–5 helpfulness rating, and copyable roast score card.
- `/scoreboard` (`src/app/scoreboard/page.tsx` + `src/components/ScoreboardView.tsx`):
  - Public **Toggle Wars Live Scoreboard**: head-to-head variant comparison (`brutal_checklist` vs `guided_coach`), Bayesian chance-to-win bars, funnel conversion (`Exposures → Completed → Rewrite Copied → Rated Helpful`), segment breakdown by role/input type, and live Flagsmith SDK debugger.

### Phase 5: Final Verification & Hackathon Docs
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- Write complete `README.md` with Flagsmith Experimentation setup guide (creating the exact multivariate flags & metrics in Flagsmith dashboard) and demo script.
