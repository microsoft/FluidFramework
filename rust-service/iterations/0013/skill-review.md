# Iteration 0013 Skill Review

## Evidence Reviewed

Reviewed all 14 workstream notable-event tables, the Phase 2 integration report, the [retrospective](retrospective.md), current coordination skill, and prior lessons on multi-worktree provenance, generated artifacts, and temporary-state cleanup.

## Candidate Skills or Changes

- **Command-local worktree binding:** trigger when concurrent delegated commands report sibling paths or exit unexpectedly. Use `git -C`, absolute `--manifest-path`, explicit target paths, and command-local identity output. This prevents a correct preflight guard from being followed by a command in another checkout.
- **Early strict rustdoc:** trigger for crate-cleanup documentation work. Run warning-denied rustdoc, with `missing_docs` where appropriate, before broad edits; `sea-webtransport` exposed 78 protocol items only at strict validation.
- **Centralized Node gates:** trigger when Rust-only workstreams share unchanged pnpm inputs. Run package Rust gates locally and one frozen install plus repository policy/build at integration to avoid repeated setup failures.
- **Input-boundary review:** trigger when code parses framed bytes, accepts capacities or bounds, or crosses transport cancellation boundaries. Test degenerate inputs before downstream operations that may panic or silently do nothing.

## Decisions

- **Accepted, no skill edit:** command-local absolute paths, direct Git inspection, exact generated-artifact checks, and cleanup are already explicit in the coordination skill.
- **Accepted, local instruction:** early strict rustdoc and crate-level boundary review belong in future crate-cleanup instructions rather than the general coordination workflow.
- **Accepted, charter policy:** centralize repository pnpm gates at integration unless a workstream owns relevant Node inputs.
- **Accepted, LEARNINGS:** promote the input-boundary validation lesson because five independent fixes support it.
- **Deferred:** dedicated terminal allocation as a tooling requirement; current tools do not expose stable per-subagent terminal assignment.

## Applied Changes

- Added one evidence-backed input-boundary lesson to `rust-service/LEARNINGS.md`.
- No coordination skill or template changed. Existing `Run a Workstream`, `Integrate Phase 2`, and `Recovery` guidance already requires the accepted provenance and cleanup practices.
- The iteration charter itself centralized final pnpm policy and build evidence; both passed at integration.

## Next Review Triggers

- A future iteration again sees commands execute in sibling worktrees despite command-local absolute binding.
- A workstream must alter Node inputs and cannot obtain trustworthy package-scoped validation before integration.
- Strict rustdoc repeatedly discovers large documentation gaps only after implementation work.
- Another delegated summary contradicts direct Git state or omits exact generated artifact paths and sizes.
