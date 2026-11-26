# DevRoast Lab — Live Flagsmith A/B Experimentation Arena

Built for **Toggle Wars: The Flagsmith Experimentation Hackathon (Track 01: Test Something Real)**.

---

## The Real Experiment Hypothesis

When developers optimize a **GitHub README**, **Resume Bullet**, or **Project Pitch**, which feedback UX drives higher real conversion (`rewrite_copied` + helpfulness rating)?

- **Variant A (`brutal_checklist` — 50%):** Instant scorecard, blunt red-flag teardown with inline Before → After snippets, interactive 4-point fix checklist, and immediate rewrite.
- **Variant B (`guided_coach` — 50%):** Interactive 3-step diagnostic coaching walkthrough with quick-pick proof chips and custom metric injection before unlocking the tailored rewrite.

We also run a secondary multivariate experiment (`rewrite_unlock_flow`: `instant_reveal` vs `interactive_step`) and evaluate visitor traits (`role`, `experience_level`, `input_type`) for cohort segmentation across `student`, `mid`, and `senior` profiles.

---

## Core Flagsmith Integration

1. **Multivariate & Feature Flags (`@flagsmith/flagsmith` v12.6.0+):**
   - `roast_strategy_experiment` (`brutal_checklist` vs `guided_coach`)
   - `rewrite_unlock_flow` (`instant_reveal` vs `interactive_step`)
   - `live_scoreboard_enabled` (`true` / `false`)
2. **Persistent Browser Identity & Segments (`flagsmith.identify`):**
   - Each browser persists a unique `visitorId` in `localStorage` and calls `flagsmith.identify(visitorId, { role, experience_level, input_type })` for real user bucketing & trait segmentation.
3. **Flagsmith Experimentation Events (`enableEvents: true`):**
   - `trackExposureEvent("roast_strategy_experiment")` & `trackExposureEvent("rewrite_unlock_flow")`
   - `trackEvent("roast_completed", { value: overallScore })`
   - `trackEvent("rewrite_copied", { value: timeToCopyMs })` — **Primary KPI**
   - `trackEvent("feedback_helpful", { value: stars })`
   - Automatic `flushEvents()` + a live **SDK Inspector** drawer in the Arena header to inspect real-time flag evaluations and event payloads.
4. **Live Bayesian Scoreboard (`/scoreboard`):**
   - Beta-Binomial Monte Carlo win probabilities (`chanceToWin`), 95% credible intervals, relative lift %, Sample Ratio Mismatch (`SRM`) Chi-Square health check, 20-exposures/arm power gate, conversion funnel bars, `rewrite_unlock_flow` comparison, trait-segmented breakdowns (`Input Type` & `Experience Level`), and CSV/JSON export.

---

## Key Features

- **1-Click GitHub README Fetch:** Paste any `https://github.com/owner/repo` URL to roast and rewrite a live repository's `README.md`.
- **Dual Analysis Engine:** Works out-of-the-box with the deterministic DevRoast Rubric Engine (stack detection, metric & verb audits, personalized rewrites) and upgrades automatically with **Gemini**, **OpenAI**, or **Anthropic** keys.
- **Before → After Diff & Shareable Roast Card:** Compare original vs upgraded copy side-by-side or copy a formatted Markdown scorecard.

---

## Quick Start (Local Setup)

```bash
npm install
cp .env.example .env.local
```

Create `.env.local` (see [.env.example](.env.example)):

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_FLAGSMITH_ENV_KEY` | Yes (Live Cloud) | Client-side Environment Key from Flagsmith (`Environment Settings → SDK Keys`) |
| `FLAGSMITH_SDK_API_URL` | Optional | Defaults to `https://edge.api.flagsmith.com/api/v1/` |
| `FLAGSMITH_API_KEY` | Optional | Flagsmith Organisation API Token for 1-click flag provisioning |
| `FLAGSMITH_PROJECT_ID` | Optional | Numeric Flagsmith Project ID for Management API provisioning |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Optional | Upgrades roasts with LLM output (falls back cleanly to DevRoast Rubric Engine) |

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

### What Should Happen When It Works
1. **Header Status:** Shows `Live Flagsmith Edge` (when `NEXT_PUBLIC_FLAGSMITH_ENV_KEY` is set) or `Local Experiment Mode` (zero-config fallback), plus your active variant (`brutal_checklist` or `guided_coach`).
2. **SDK Inspector:** Clicking **SDK Inspector** displays `flagsmith.identify()` traits (`role`, `experience_level`, `input_type`) and live `$flag_exposure`, `roast_completed`, `rewrite_copied`, and `feedback_helpful` event payloads.
3. **Variant Switching:** Clicking the Visitor ID badge rotates identity and re-evaluates `roast_strategy_experiment` deterministically (~50/50 split).
4. **Scoreboard (`/scoreboard`):** Displays Bayesian win probabilities, 95% credible intervals, conversion funnel bars, SRM health check, and trait-segmented cohorts.

### Connecting Live Flagsmith Cloud
1. Click **Flagsmith Setup** in the header (or configure `.env.local`).
2. Add your `NEXT_PUBLIC_FLAGSMITH_ENV_KEY` (and optional `FLAGSMITH_API_KEY` + `FLAGSMITH_PROJECT_ID`).
3. Click **Provision Flags** inside the setup modal to create `roast_strategy_experiment`, `rewrite_unlock_flow`, and `live_scoreboard_enabled` in your Flagsmith project.
4. In Flagsmith Cloud → **Metrics**, create `rewrite_copied` (Occurrence, Primary), `roast_completed` (Occurrence), and `feedback_helpful` (Mean), then launch an Experiment on `roast_strategy_experiment`.
5. Click **Zero Counts (Go Live)** before sharing your deployed URL to collect fresh real-user traffic!

---

## Live Submission Links

- **Live App:** https://devroast-lab.vercel.app
- **Demo Video:** https://youtube.com/shorts/iCWGS9k_mtI

---

## 2-Minute Demo Script (Toggle Wars Submission)

1. **0:00–0:20 (The Problem & Hypothesis):** Show `/` and explain the real hypothesis: *Brutal Checklist (`brutal_checklist`) vs Guided Coach (`guided_coach`) — which converts more developers to copy their upgraded README/Resume?*
2. **0:20–1:05 (Live Arena & SDK Inspector):** Paste a GitHub repo URL (or sample), open **SDK Inspector** to show `flagsmith.identify()` traits, submit a roast, watch `$flag_exposure` + `roast_completed` fire, copy the upgraded rewrite (`rewrite_copied`), and click the visitor ID pill to demonstrate deterministic A/B switching to the other variant.
3. **1:05–1:45 (Scoreboard & Statistical Integrity):** Open `/scoreboard` to show the conversion funnel, Bayesian win probability, 95% credible interval, SRM health check, `Experience Level` segment insight, and dynamic traffic weight shifting (`50/50` → `100% Winner`).
4. **1:45–2:15 (Flagsmith Cloud Dashboard):** Show the live flags, segments, and flushed experimentation events in Flagsmith Cloud.

---

## Verification Commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
