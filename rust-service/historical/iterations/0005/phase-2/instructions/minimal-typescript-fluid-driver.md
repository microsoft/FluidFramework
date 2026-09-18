# Iteration 0005: minimal-typescript-fluid-driver Instructions

Status: planned
Branch: `rust-service-iteration-0005-minimal-typescript-fluid-driver`
Iteration source commit: `2de3d94f89ecff3e340eb1d580d628d5d951681b`
Owner: assigned iteration `0005` implementation agent
Report: `rust-service/iterations/0005/phase-2/minimal-typescript-fluid-driver.md`

## Assignment

Build the smallest TypeScript Fluid driver and browser application trace that consumes the packaged client. Hypothesis: a Fluid application can create, load, submit, summarize, disconnect, reconnect, and recover without private FSQ2 decoding or invented retry policy. Disprove first with a two-client counter/shared-object trace where reconnect loses, duplicates, or reorders an acknowledged operation or reload cannot fetch its summary blobs.

## Ownership

Wave 3 consumer. Writable: a new minimal TypeScript driver package/example, focused Node/browser harnesses, and this report. Interface mapping and scaffold-only work may begin before prerequisites, but implementation waits for coordinator-integrated projected-read/recovery, blob/summary, and browser-package commits. Rust protocol/service/client and existing Fluid packages are read-only unless separately assigned. Do not copy FSQ2 decoding, bypass the WASM package, add offline-first merge, or claim full Routerlicious/ODSP compatibility.

## Expected Evidence

Deliver only the required Fluid driver interfaces for create/load, bounded historical reads, live submission, blob and summary storage, disconnect/reconnect, and explicit pending recovery, plus a real browser example. Record every unsupported interface. Node contract tests and a two-client Chromium trace must cover reload from summary, concurrent submissions, disconnect before/after commit, and no loss/duplication. Measure startup, package size, and wire bytes only where the harness exposes equivalent counters.

## Validation

Print absolute checkout, branch, and HEAD. Run the selected package's repository-standard formatting, lint, typecheck, unit tests, build, and Node contract suite, then run the two-client Chromium end-to-end trace against the assembled native service. Use existing package-manager and lockfile policy; do not modify shared lockfiles outside assigned ownership. Finish with `git diff --check`, clean status, exact versions, and reproducible commands in the report.

## Escalation and Stopping Conditions

Stop if a prerequisite is absent, the driver needs private canonical decoding, hidden retry, environment-specific FSP4 behavior, unimplemented blob/summary guarantees, or broad changes to existing Fluid runtime interfaces. A mapped minimal interface set and failing end-to-end trace are useful partial evidence; do not paper over unsupported methods or silently expand compatibility claims.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
