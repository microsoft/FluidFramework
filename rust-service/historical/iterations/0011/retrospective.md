# Iteration 0011 Retrospective

## What We Expected

Six ownership-separated audits would improve tests, documentation, and reproducible defects across every Rust workspace member and the minimal TypeScript driver. Exclusive writable paths and one integration synthesis were expected to avoid source conflicts while preserving shared contracts.

## What We Observed

All workstreams completed and integrated without source conflicts. The audits found six defect classes spanning storage limits, sequencer ambiguity, compressed-frame validation, stream EOF/identity lifecycle, optional capability forwarding/resource cleanup, and CLI diagnostics. Full integration exposed one additional stale driver test expectation and two workspace-only Clippy issues. No dependency, public API, wire format, persistence format, or historical benchmark evidence changed.

Negative evidence was useful: encryption and stateful-compression audits found no production defects beyond added tests/docs; performance work was deliberately avoided; decoded-size policy and awaitable synchronous teardown remained inconclusive rather than being redesigned speculatively.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Multiple workstreams recorded delegated commands running in sibling worktrees or returning summaries without the requested identity. Direct absolute-path reruns were required; see the Fluid-service and driver reports plus Phase 2 integration.
- Two review agents inspected kickoff-state files instead of named source commits and produced plausible but stale findings. Exact `git show --name-status` and source-branch report reads replaced them.
- Ignored generated WASM packages were absent in worktrees. Fresh generation was necessary before the existing driver contract could execute; once run, it exposed the projected-acknowledgement expectation mismatch.
- A shell cleanup trap did not fire because the VS Code terminal is persistent. Temporary dependency symlinks had to be removed explicitly.
- Package-scoped Clippy passed while workspace Clippy found `similar_names` and `items_after_test_module` in newly added tests. Both were mechanical integration fixes.
- Approximate elapsed time and token use are unknown. No user intervention was required after kickoff.

## Agentic Development Findings

The six-way decomposition was effective: every production path had one owner and all cherry-picks were conflict-free. Instructions were sufficiently narrow to prevent semantic redesign while still permitting real fixes. Workstream reports provided useful inventories and residual risks.

The weak point was execution provenance, not decomposition. Shared persistent terminals and delegated summaries repeatedly lost or contradicted checkout identity. Review agents also failed to inspect named commits reliably. Direct Git object inspection and absolute worktree guards were more trustworthy than narrative summaries. Integration validation was essential: isolated streams could not expose the optional-capability handoff or projected-acknowledgement test behavior.

## Practices to Keep, Change, or Stop

- **Keep:** exclusive writable paths, same kickoff commit, concurrent worktrees, regression-before-fix, and report-as-work-occurs requirements. Owner: coordination skill.
- **Keep:** package-focused checks during workstreams followed by full workspace all-target/all-feature gates at integration. Owner: coordinator.
- **Change:** delegated validation commands must assert absolute worktree, branch, expected HEAD, and clean/known status inside the command; reject summaries missing those lines. Owner: coordination skill and coordinator.
- **Change:** generate and execute ignored downstream artifacts at integration even when source-level tests pass. Owner: coordinator.
- **Stop:** accepting review prose that does not demonstrate it inspected the named Git object or checkout. Owner: coordinator.
- **Stop:** relying on shell `EXIT` traps for cleanup in persistent VS Code terminals; clean validation artifacts explicitly. Owner: all agents.

## Durable Lessons

- Structural optional capabilities must be forwarded through decorators; this generalizes to any wrapper whose interface includes optional methods.
- Authoritative projected delivery can resolve local submission ambiguity before an explicit response; this generalizes to acknowledgement paths in streamed systems.
- Final strict linting must select the whole workspace/all targets/all features; package-only validation can miss integration selection effects.

## Open Questions

- Should independent compression adopt a decoded-size limit, and where should that policy live without changing transparent-wrapper contracts?
- Should a future Fluid-facing API expose awaitable teardown, or is eventual tested cleanup sufficient?
- How should isolated worktrees obtain built local-driver/server declarations without borrowing dependency links from another checkout?
- What power-loss, cross-host fencing, retention, and deployment evidence is required before production claims?
