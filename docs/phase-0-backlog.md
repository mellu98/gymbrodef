# Phase 0 Backlog

Goal: reduce release fragility in the current repo without a rewrite. This phase is only about making the codebase safer to change, easier to verify, and less likely to break while we move toward mobile, subscriptions, and store readiness.

## 0.1 Split the monolith into external assets

Task:
- Move the full `<style>` block from `index.html` into an external stylesheet.
- Move the full inline runtime `<script>` from `index.html` into an external JS file.
- Keep `programs-inline` in place for now unless the data split is needed to unblock the extraction.

Dependencies:
- None. This is the first implementation slice.

Acceptance criteria:
- `index.html` loads the app by linking an external CSS file and an external JS file.
- The page still renders the same major sections and navigation.
- No behavior changes are introduced beyond the file split.
- The app still starts from the same entry page and the shell works on desktop and mobile.

## 0.2 Add a minimal smoke-check harness

Task:
- Add a small Node-based smoke check that verifies the app shell files exist and the key assets are referenced correctly.
- Add a second smoke check for the most fragile logic assumptions: program load path, section navigation markers, and critical storage keys.
- Keep the setup dependency-free if possible.

Dependencies:
- Requires 0.1, or at least stable filenames for extracted CSS and JS.

Acceptance criteria:
- There is a repeatable command that runs a smoke check locally.
- The smoke check fails clearly if the shell entry points or critical references are broken.
- The smoke check can run in CI later without extra environment setup.

## 0.3 Centralize app state and navigation boundaries

Task:
- Introduce a single state owner for current section, current program, current day, current week, and overlay state.
- Stop spreading navigation logic across unrelated rendering functions.
- Define clear entry points for `programs`, `home`, `progress`, `nutrition`, and `coach`.

Dependencies:
- Requires 0.1, because the extracted JS should be the first place for state ownership.

Acceptance criteria:
- There is one obvious place where section changes happen.
- Rendering functions read state instead of mutating it directly where possible.
- Navigation changes no longer depend on scattered side effects.

## 0.4 Fix critical logic mismatches

Task:
- Fix the date format mismatch between workout history and nutrition training/rest inference.
- Verify that imported programs, active program state, and history keys remain consistent after the fix.
- Review any other storage-key or date-format assumptions that can corrupt progress or nutrition behavior.

Dependencies:
- Requires 0.3, because state ownership must be clear before changing logic that depends on it.

Acceptance criteria:
- Workout history and nutrition day classification use the same date model.
- Training/rest inference behaves deterministically on the same user data.
- No existing saved program state is silently broken by the change.

## 0.5 Reduce release fragility in the backend entry path

Task:
- Separate clearly the healthcheck, AI endpoints, PDF import path, and static asset serving in `server.js`.
- Add a minimal error-handling pass so missing env vars and endpoint failures are explicit.
- Make sure the health endpoint reflects the real readiness of the app more honestly.

Dependencies:
- Can start after 0.1, but should be aligned with 0.2 so the shell and backend can be checked together.

Acceptance criteria:
- AI-related failures are explicit and easy to diagnose.
- The healthcheck does not falsely imply the app is fully ready when core dependencies are missing.
- PDF import and AI routes still work as before when the required env vars are present.

## 0.6 Add quality gates for the future

Task:
- Add the minimal scripts needed for linting, smoke checks, and a basic verification flow.
- Document how to run the checks locally.
- Prepare the repo so a later CI step can be added without redesigning the workflow.

Dependencies:
- Requires 0.2 and 0.5 to be stable enough to check.

Acceptance criteria:
- `package.json` exposes a repeatable verification command set.
- A new contributor can run the checks without guessing the order.
- The repo has a clear minimum quality bar before feature work resumes.

## Recommended execution order

1. Externalize CSS and JS.
2. Add the smoke-check harness.
3. Centralize state and navigation.
4. Fix the critical logic mismatches.
5. Harden the backend entry path.
6. Add the quality gates and document the checks.

## Done for Phase 0

Phase 0 is complete when:
- The monolith is partially split into external CSS and JS.
- The app has at least one usable smoke check.
- State and navigation have a single clear owner.
- The date mismatch in nutrition logic is fixed.
- The backend failure modes are explicit.
- The repo has a minimum quality gate for future work.
