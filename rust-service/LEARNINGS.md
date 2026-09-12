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
- **Confirmed:** A clean agent can begin Phase 1 from the plan, development policy, active report, and coordination skill without prior conversation context when repository instructions own the read order and completion gates. [Evidence](foundation-report.md#notable-events)
