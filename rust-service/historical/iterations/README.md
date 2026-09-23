# Iteration Records

Each four-digit directory records one user-approved Phase 2/Phase 3 cycle; completed records are append-only.
Use the [coordination skill](../../../.github/skills/rust-service-coordination/SKILL.md) to choose between an iteration and lightweight direct work.
One-owner sequential tasks normally need no iteration; ask before initializing an iteration the user did not request.

After approval, initialize the next unused number from the repository root:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init NNNN workstream-name
```

For a contract and regression-test quality iteration, also initialize its quality inventory:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init-quality NNNN
```

For a current-state simplification iteration, instead initialize its simplification inventory:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs init-simplification NNNN
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

Set `sourceCommit` to the latest approved base, including accepted lightweight work.
Complete the charter/instructions and set the manifest status before each validation:

| Validation stage | Required status |
| --- | --- |
| `start` | `active` |
| `phase-2` | `phase-2-complete` |
| `complete` | `complete` |

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN start
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN phase-2
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs next NNNN next-workstream
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate NNNN complete
```

Before completing a quality iteration, validate its specialized inventory:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-quality NNNN
```

Before completing a simplification iteration, validate its specialized inventory:

```bash
node .github/skills/rust-service-coordination/scripts/iteration-records.mjs validate-simplification NNNN
```
