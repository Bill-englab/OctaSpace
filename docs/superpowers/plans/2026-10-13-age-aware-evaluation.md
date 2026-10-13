# Age-Aware Growth Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text record summary with a structured, age-aware evaluation of the child's development and the family's cultivation goals.

**Architecture:** A versioned local reference pack supplies verified age guidance. The evaluation path combines that pack with profile, goals, and optional observations, asks MaaS for a validated structured report, and saves a backward-compatible snapshot. React renders new reports as dimension and action cards while preserving old text reports.

**Tech Stack:** Node.js 24+, node:sqlite, built-in node:test, React 19, Vite 8, plain CSS.

## Global Constraints

- Daily records remain optional and unjudged; no-record must never mean no activity.
- The app stays local and user-triggered; API secrets and real child data never enter source or tests.
- The current child is just over 4 years old; treat 4-year references as current observation and 4–5-year-end guidance as future direction.
- No standardized developmental score, medical diagnosis, invented academic age norm, or scoring radar.
- Continue supporting both OpenAI-compatible and Anthropic MaaS formats and existing report backups.
- Output no more than three action cards and three follow-up questions.

---

### Task 1: Age reference and evaluation context

**Files:**
- Create: `server/age-reference.js`
- Modify: `server/context.js`
- Test: `test/age-reference.test.js`, `test/context.test.js`

**Interfaces:**
- Produces `getAgeReference(birthday, onDate)` returning `{ ageMonths, ageLabel, version, items }`; `items` contain stable IDs, dimension IDs, stage, paraphrase, and source URL.
- Produces `buildEvaluationContext(db, { from, to })` returning existing date-range context plus `goals`, including goal status history and baseline even if records are empty.

- [ ] **Step 1: Write failing tests** for a child turning four at the range end, reference IDs covering all five dimensions, no birthday, and active goals with observations outside the selected range. Example:

```js
assert.equal(getAgeReference('2022-09-25', '2026-10-13').ageMonths, 48);
assert.deepEqual(new Set(getAgeReference('2022-09-25', '2026-10-13').items.map(x => x.dimension)), new Set(['de','zhi','ti','mei','lao']));
assert.equal(buildEvaluationContext(db, { from:'2026-10-01', to:'2026-10-13' }).goals[0].title, '主动表达');
```

- [ ] **Step 2: Run** `node --test test/age-reference.test.js test/context.test.js`; expect the new exports/tests to fail.
- [ ] **Step 3: Implement** a compact paraphrased age pack from the official Education Ministry guide and CDC; compute completed months; query active goals and observations up to `to` without requiring same-period activity. Example interface:

```js
export function buildEvaluationContext(db, range) {
  const context = buildContext(db, { ...range, comparison: true });
  const goals = listEvaluationGoals(db, range.to);
  return { ...context, goals };
}
```

- [ ] **Step 4: Re-run targeted tests and commit** the reference/context work.

### Task 2: Structured report, prompt, persistence, and backups

**Files:**
- Create: `server/evaluation-report.js`
- Modify: `server/ai.js`, `server/db.js`
- Test: `test/ai.test.js`, `test/db-migration.test.js`, `test/backup.test.js`

**Interfaces:**
- Produces `evaluationPrompt(context, ageReference)` and `parseEvaluation(raw, { sourceIds, ageReference })`.
- `generateEvaluation` returns `{ ..., report, referenceVersion }` for a new report; `listEvaluations` returns the same fields or `report:null` for legacy rows.

- [ ] **Step 1: Write failing tests** requiring the outgoing MaaS system message to include the age pack, goals, “未记录不等于没做”, and a JSON schema; verify that malformed reports are not saved, fake record IDs are excluded, all five dimensions and action cards are present, and a goal-only profile can generate. Example:

```js
assert.match(sent.messages[0].content, /未记录.{0,10}不等于/);
assert.equal(saved.report.dimensions.length, 5);
assert.equal(saved.report.actions.length <= 3, true);
assert.equal(listEvaluations(db)[0].report.summary.judgement, '示例判断');
```

- [ ] **Step 2: Run** `node --test test/ai.test.js test/db-migration.test.js test/backup.test.js`; expect red tests.
- [ ] **Step 3: Implement** the detailed rules from the spec: age/current-vs-next-stage, five domains, explicit evidence levels, family-goal gap, no record-frequency criticism, at most three concrete actions, citations and limitations. Validate exact JSON fields; reject half-output. Preserve `content`, add nullable `report_json` and `reference_version` columns with migration. Example shape:

```js
const report = parseEvaluation(raw, { sourceIds: context.sourceIds, ageReference });
db.prepare('INSERT INTO evaluations(id,from_date,to_date,content,sources_json,coverage_json,model,created_at,report_json,reference_version) VALUES (?,?,?,?,?,?,?,?,?,?)')
  .run(id, input.from, input.to, report.summary.judgement, JSON.stringify(sources),
    JSON.stringify(context.coverage), config.model, createdAt,
    JSON.stringify(report), ageReference.version);
```

- [ ] **Step 4: Re-run targeted tests**, verify old backup import and new backup export round-trip, then commit.

### Task 3: Evaluation cards and readable legacy view

**Files:**
- Create: `src/EvaluationReport.jsx`, `src/evaluation.css`
- Modify: `src/App.jsx`, `src/main.jsx` (only if the new stylesheet needs importing)
- Test: targeted browser interaction and `pnpm build`

**Interfaces:**
- `EvaluationReport({ evaluation, onSource })` renders a new `report` as overview, family goal, five dimension cards, up to three action cards, follow-up questions, and source/reference links; legacy `report:null` shows readable original text.

- [ ] **Step 1: Add a small render contract** to `EvaluationReport.jsx` with an accessible article/section per dimension, visible status, and inline evidence links. Example:

```jsx
{evaluation.report ? <div className="assessment-grid">{evaluation.report.dimensions.map(item =>
  <section key={item.id} className="assessment-dimension"><h3>{item.title}</h3><p>{item.verdict}</p></section>
)}</div> : <div className="legacy-report">{evaluation.content}</div>}
```

- [ ] **Step 2: Replace** the report body in `EvaluationPage` with `EvaluationReport`, update the generation/empty-state copy to say records are optional, and show the evaluation-date age.
- [ ] **Step 3: Style** cards with existing green/white tokens, two columns on desktop, one on mobile; evidence expands without a wall of text. Run `pnpm build` and verify the generated page at desktop and narrow viewport.
- [ ] **Step 4: Commit** UI work.

### Task 4: End-to-end acceptance and rollout

**Files:**
- Modify: `test/api.test.js` if the response contract needs coverage
- Modify: `docs/design/system.md` for the new evaluation layout only

**Interfaces:** Existing `GET/POST /api/evaluations` remain the public endpoints. Legacy reports retain `content`, `sources`, and `coverage`.

- [ ] **Step 1: Run** `node --test`, `pnpm build`, and `git diff --check`; resolve failures.
- [ ] **Step 2: Verify** a synthetic report in the UI and a legacy report in the same list; confirm mobile and desktop layouts, source links, and no score/radar.
- [ ] **Step 3: Generate** one fresh real-model report using the existing local configuration and data, without exposing credentials or altering old reports; review whether it follows the approved style. If the model fails schema validation, adjust prompt/schema and retry until an actual complete report is saved.
- [ ] **Step 4: Update** the design-system evaluation section, check that no real child details or credentials are tracked, then commit and integrate into the local main branch. Restart the local service and verify the user-facing report page.
