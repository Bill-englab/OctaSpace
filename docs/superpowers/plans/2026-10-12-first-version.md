# Child Growth Journal First Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable local growth journal with category-based daily logging, progress, on-demand MaaS assessment, and independent chat.

**Architecture:** One Node.js 24 server serves the Vite-built React app and JSON APIs. SQLite and a local media directory hold all child data. A provider adapter maps the same internal AI request to OpenAI-compatible Chat Completions or Anthropic Messages.

**Tech Stack:** Node.js 24 (`node:http`, `node:sqlite`, `node:test`), React with Vite, CSS, SVG charts; no server runtime npm dependencies.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-10-12-child-growth-journal-design.md`.
- Record entry and diary are the main experience. AI assessment is user-triggered; AI chat is a separate page.
- Desktop design follows C “成长时间线”; mobile uses a touch-friendly single column. No page max-width limit.
- Only a single child profile is in scope; use age as context, not a diagnostic score.
- Data stays local except the selected context sent on user-triggered MaaS calls.
- Support OpenAI-compatible Chat Completions and Anthropic Messages with server-side keys.
- Voice transcription and automatic synchronization with the older English app are outside this version.

## File Map

- `package.json`, `vite.config.js`: Node requirement, frontend build and scripts.
- `server/index.js`: HTTP routing, static serving, session handling, upload and backup endpoints.
- `server/db.js`: SQLite initialization, migrations and database lifecycle.
- `server/records.js`: categories, activities, diary, goals and observation persistence.
- `server/analytics.js`: deterministic dashboard, heatmap and radar data.
- `server/context.js`: time-range retrieval, source references and bounded context preparation.
- `server/providers.js`: OpenAI-compatible and Anthropic request/response mapping.
- `server/ai.js`: chat and evaluation orchestration, report persistence.
- `server/settings.js`: child profile, MaaS configuration and access code.
- `index.html`, `src/styles.css`: React mount point and desktop/mobile visual system.
- `src/App.jsx`, `src/api.js`, `src/features/*`: app shell, transport and focused feature views.
- `docs/design/timeline-desktop-concept.png`, `docs/design/system.md`: approved C layout reference and extracted visual rules.
- `test/*.test.js`: critical data, auth, context and provider tests.
- `README.md`: setup, LAN access, MaaS configuration, backup and limitations.

### Task 1: Local service, storage and access control

**Files:** Create `package.json`, `vite.config.js`, `server/index.js`, `server/db.js`, `server/settings.js`, `test/server.test.js`, `.gitignore` updates.

**Interfaces:**
- `openStore(dataDir): { db, mediaDir, close() }` creates schema and folders.
- `createServer({ dataDir, host, port }): http.Server` serves `/api/*` and `public/*`.
- `requireSession(request): boolean` gates APIs and media after `/api/login`.

- [ ] **Step 1: Write failing service tests.**

```js
test('health and access code protect child data', async () => {
  const app = await startTestServer();
  assert.equal((await fetch(`${app.url}/api/health`)).status, 200);
  assert.equal((await fetch(`${app.url}/api/profile`)).status, 401);
  const login = await fetch(`${app.url}/api/login`, { method: 'POST', body: JSON.stringify({ code: app.code }) });
  assert.equal(login.status, 200);
  await app.close();
});
```

- [ ] **Step 2: Run `node --test test/server.test.js`; verify a missing-module failure.**
- [ ] **Step 3: Implement schema and server.** Use `DatabaseSync` with `PRAGMA foreign_keys=ON`; create profile, category, activity, diary, goal, observation, media, chat and evaluation tables. Hash the family code with `scrypt`; issue an HttpOnly SameSite session cookie after successful login. Serve configuration writes only from loopback.

```js
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(dataDir, 'journal.sqlite'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
```

- [ ] **Step 4: Run service tests and verify expected HTTP statuses.**
- [ ] **Step 5: Commit foundation.** `git add package.json server test .gitignore && git commit -m "feat: add local journal service"`

### Task 2: Categories, activities, diaries, progress and media

**Files:** Create `server/records.js`, `test/records.test.js`; extend `server/index.js`.

**Interfaces:**
- `listTimeline(db, { from, to, categoryId }): Activity[]` returns activities with media and observations.
- `saveActivity(db, input): Activity`, `saveDiary(db, input): Diary`, `saveGoal(db, input): Goal`, `saveObservation(db, input): Observation` validate and persist input.
- `POST /api/media` accepts a bounded raw file body with MIME metadata and returns its ID; `GET /api/media/:id` requires a session.

- [ ] **Step 1: Write failing tests for category creation, activity ordering, daily diary, goal status history and media authentication.**

```js
assert.deepEqual(listTimeline(db, { from: '2026-10-12', to: '2026-10-12' }).map(x => x.note), ['afternoon', 'morning']);
assert.equal(saveObservation(db, { goalId, status: 'independent', observedAt: '2026-10-12', note: 'rode around cones' }).status, 'independent');
```

- [ ] **Step 2: Run `node --test test/records.test.js`; verify failures.**
- [ ] **Step 3: Implement validated CRUD and API routes.** Required activity values are category, event time and note; duration, mood, details, goal and media are optional. Diary accepts multiple entries per local day. Use IDs and parameterized SQL. Limit media size and allow image JPEG/PNG/WebP and MP4/WebM only.

```js
db.prepare('INSERT INTO activities (id, category_id, occurred_at, local_date, note) VALUES (?, ?, ?, ?, ?)')
  .run(id, categoryId, occurredAt, localDate, note);
```

- [ ] **Step 4: Run records tests and an authenticated create/list/edit/delete API smoke check.**
- [ ] **Step 5: Commit records.** `git add server test && git commit -m "feat: add daily records and progress"`

### Task 3: Deterministic growth summaries

**Files:** Create `server/analytics.js`, `test/analytics.test.js`; extend `server/index.js`.

**Interfaces:**
- `getDashboard(db, { from, to }): { totals, heatmap, categories, dimensions, goals }`.
- Heatmap intensity is count of distinct categories per local day; dimension values are independent goals divided by total documented goals in the dimension, with numerator and denominator retained.

- [ ] **Step 1: Write failing tests showing empty dimensions as insufficient data, distinct-category counting and most-recent goal status.**

```js
assert.deepEqual(getDashboard(db, range).dimensions.find(x => x.name === '体育'), { name: '体育', independent: 1, total: 2, ratio: 0.5 });
```

- [ ] **Step 2: Run `node --test test/analytics.test.js`; verify failures.**
- [ ] **Step 3: Implement SQL-backed summaries and `/api/dashboard`.** Keep charts grounded in counts; never derive a normative developmental score.
- [ ] **Step 4: Run the analytics tests.**
- [ ] **Step 5: Commit summaries.** `git add server test && git commit -m "feat: calculate growth dashboard"`

### Task 4: MaaS configuration, context, chat and assessment

**Files:** Create `server/context.js`, `server/providers.js`, `server/ai.js`, `test/context.test.js`, `test/providers.test.js`, `test/ai.test.js`; extend `server/index.js`, `server/settings.js`.

**Interfaces:**
- `buildContext(db, { from, to, comparison }): { profile, records, comparisonRecords, sourceIds, coverage }`.
- `sendModel(config, { system, messages, maxTokens }, fetchImpl): Promise<string>` switches on `openai` or `anthropic`.
- `askChildQuestion(db, config, input, fetchImpl)` saves completed conversation turns; `generateEvaluation(db, config, input, fetchImpl)` saves completed report snapshots.

- [ ] **Step 1: Write failing context and adapter tests.** Cover date boundaries, previous equal-length period, valid source IDs, OpenAI `messages`, Anthropic top-level `system`, and provider 401/429/timeout.

```js
assert.equal(openaiCall.path, '/chat/completions');
assert.equal(anthropicCall.body.system.includes('观察'), true);
assert.equal(buildContext(db, { from: '2026-10-01', to: '2026-10-30', comparison: true }).coverage.days, 30);
```

- [ ] **Step 2: Run `node --test test/context.test.js test/providers.test.js test/ai.test.js`; verify failures.**
- [ ] **Step 3: Implement provider settings and context retrieval.** Store masked key server-side, never echo it to the browser. Require localhost for editing MaaS secrets. Use selected records and profile only; when records exceed budget, batch and summarize while retaining source IDs and reporting coverage.
- [ ] **Step 4: Implement `/api/chat` and `/api/evaluations` with on-demand execution.** Separate observed facts, inferences and suggested next activities in the prompt. Parse and validate returned source IDs before linking. Save only complete evaluations; preserve failed chat prompts for retry.
- [ ] **Step 5: Run all AI tests and a fake-provider HTTP integration check.**
- [ ] **Step 6: Commit AI workflows.** `git add server test && git commit -m "feat: add on-demand Maas assessment and chat"`

### Task 5: Desktop C interface and responsive recording flow

**Files:** Create `index.html`, `src/styles.css`, `src/api.js`, `src/App.jsx`, `src/features/Today.jsx`, `src/features/Records.jsx`, `docs/design/system.md`.

**Interfaces:**
- `api(path, options)` sends JSON with the session cookie and surfaces typed errors.
- `App()` composes navigation and the current feature view without full reload.
- Routes/views: Today, Categories, Growth, Assessment, Chat, Settings.

- [ ] **Step 1: Extract tokens, component families and exact copy from `docs/design/timeline-desktop-concept.png` into `docs/design/system.md`; create the C desktop React shell.** Left navigation, timeline main area, diary/status rail, warm ivory and sage palette, full-width layout.

```css
.app-shell { display: grid; grid-template-columns: 240px minmax(0, 1fr); min-height: 100vh; }
.page { width: 100%; padding: clamp(18px, 2.5vw, 40px); }
```

- [ ] **Step 2: Connect category quick-add, activity and diary forms, goal/observation editing and media upload.** Keep one-line activity entry sufficient for save; reveal optional fields on demand.
- [ ] **Step 3: Render the timeline with date/category filters and clickable record editing.**
- [ ] **Step 4: Add mobile breakpoints with single-column content, bottom navigation and touch targets of at least 44 CSS pixels.**
- [ ] **Step 5: Manually verify desktop and mobile viewport flows with a locally running server and commit UI.** `git add index.html src docs/design && git commit -m "feat: build growth timeline interface"`

### Task 6: Growth, AI and settings pages; backup and end-to-end verification

**Files:** Extend `src/*`, `server/index.js`; create `test/backup.test.js`, `README.md`.

**Interfaces:**
- `/api/backup` exports a versioned archive without MaaS keys; `/api/restore` validates archive content before replacing local data.
- Growth view draws heatmap, category bars, goal history and evidence-labelled radar from `/api/dashboard`.
- Assessment and Chat views use the on-demand APIs and show date coverage and source links.

- [ ] **Step 1: Write failing tests for backup exclusion of keys and restore validation.**

```js
assert.equal(exported.settings.maasApiKey, undefined);
assert.rejects(() => validateBackup({ version: 999 }), /Unsupported backup/);
```

- [ ] **Step 2: Implement versioned backup/restore and run backup tests.**
- [ ] **Step 3: Build growth, assessment, chat and MaaS settings pages.** Assessment generation must require a click; show included range/count before sending. Chat must have its own navigation destination and configurable range.
- [ ] **Step 4: Run `node --test test/*.test.js` and a local HTTP smoke check for create, edit, dashboard, fake-MaaS chat, fake-MaaS assessment and backup.**
- [ ] **Step 5: Inspect the rendered desktop and mobile UI; correct overflow, low contrast and broken controls.**
- [ ] **Step 6: Write `README.md` with Node 24 setup, localhost/LAN start commands, family access code, MaaS configuration, backup and data handling.**
- [ ] **Step 7: Commit and re-run the full verification suite.** `git add server src test README.md && git commit -m "feat: complete local growth journal first version"`

## Final Audit

- [ ] Match each requirement in the source design to an implemented API, view and verified behavior.
- [ ] Confirm the working tree is clean and the app starts using the documented command.
- [ ] Leave any actual MaaS credential unconfigured; verify adapters with fake providers and give the user the setup path.
