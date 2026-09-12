# Learning Index

This file is the curated index of durable lessons from the snapshotted append stream project. Detailed evidence remains in iteration reports, retrospectives, and decision records; add a short entry here only when a finding is useful beyond one workstream.

## How to Add an Entry

Each entry must link to its supporting artifact and state whether the lesson is confirmed, provisional, or superseded. Prefer observed findings over general advice.

```md
- **Confirmed:** Brief lesson. [Evidence](iterations/README.md)
```

## Architecture

_No findings recorded yet._

## Correctness and Testing

_No findings recorded yet._

## Performance and Operations

_No findings recorded yet._

## Agentic Development

- **Confirmed:** Test-only environment overrides must be command-scoped or visibly reported because persistent agent terminals can leak state into later validation. [Evidence](foundation-report.md#notable-events)
- **Provisional:** A clean agent should need only a task and workflow name when read order, autonomy boundaries, escalation rules, and completion gates live in repository-owned instructions. Validate this during the fresh Phase 1 session. [Evidence](foundation-report.md#notable-events)
