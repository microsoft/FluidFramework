# Iteration Records

Each four-digit directory is an append-only account of one Phase 2/Phase 3 cycle. Create it with the repository coordination skill:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init 0001 reference file-simple durable-log-spike transparent-wrapper fluid-sequencer
```

An iteration contains:

```text
0001/
  manifest.json
  charter.md
  phase-2/
    integration.md
    <workstream>.md
  phase-3-report.md
  retrospective.md
  skill-review.md
  next-phase-2-instructions/
    <workstream>.md
```

The charter records hypotheses and expected evidence before implementation. Workstream reports are updated while work occurs, not reconstructed only at the end. Phase 3 records decisions, costly failures, process lessons, and skill changes before the iteration is considered complete.

Set the generated manifest's `sourceCommit` to the approved foundation or previous Phase 3 commit. Complete the charter and instructions, set status to `active`, and validate them before committing the iteration kickoff. Set status to `phase-2-complete` before the Phase 2 check. During Phase 3, generate next-iteration instructions and set status to `complete` before the final check:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0001 start
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0001 phase-2
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs next 0001 next-workstream
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate 0001 complete
```
