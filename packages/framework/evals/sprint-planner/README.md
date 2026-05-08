# Sprint Planner

An example app demonstrating a SharedTree AI agent for sprint planning, with an integrated evaluation framework.

## Prerequisites

- Node.js 18+
- pnpm
- Azure CLI (`az login`) — used for Entra ID authentication against Azure OpenAI

## Setup

```bash
# From the repo root
pnpm install

# Build dependencies and the sprint-planner package
pnpm --filter @fluidframework/eval-framework build
pnpm --filter @fluidframework/eval-app build
pnpm --filter @fluid-private/sprint-planner build
```

## Authentication

All LLM calls go through Azure OpenAI using Entra ID authentication via `DefaultAzureCredential`. No API keys are needed — just sign in once:

```bash
az login
```

This single login is shared across the CLI, eval server, and browser app.

## Running the App

```bash
pnpm start
```

This starts a Tinylicious server and the webpack dev server with a local proxy that forwards Azure OpenAI requests using your `az login` session. The browser app loads a sprint board with sample data and an AI chat assistant.

## Running the CLI

```bash
node dist/index.js
```

Runs a standalone script with hardcoded queries against the sprint board to verify the Azure OpenAI integration end-to-end.

## Running Evals

The evaluation framework tests the AI agent's ability to correctly edit sprint board data. It uses an LLM-as-judge approach with configurable rubrics.

### Quick Start

```bash
pnpm eval
```

This starts the eval server. From the web UI, select a dataset and run evaluations against the `gpt-4o-mini` deployment.

### Understanding Results

Results are written to `results/scenario-<name>-<timestamp>/`:

```
results/scenario-<name>-2026.../
├── result.json              # Scenario summary (avg score, evaluators used)
├── summary.md               # Human-readable scenario-level report
├── llmEvalConfig.json       # Rubrics and data interpretation prompt
└── dataset-<name>/
    ├── result.json          # Per-dataset scores
    ├── summary.md           # Human-readable evaluation report
    ├── appInput.json        # Initial tree state and prompt sent to the agent
    └── appOutput.json       # Final tree state after the agent ran
```

`appInput.json` and `appOutput.json` contain the before/after tree states so the LLM judge can compare them.

### Adding New Scenarios

Add a new JSON file to `datasets/`. Each file defines one scenario with one or more test cases:

```json
{
  "name": "My New Scenario",
  "metadata": { "description": "What this scenario tests" },
  "domainHints": "Context about the sprint board domain for the agent...",
  "datasets": [
    {
      "name": "Test case name",
      "prompt": "Your natural language instruction here"
    }
  ],
  "rubrics": [{ "name": "Task Completion", "description": "Scoring criteria..." }],
  "dataInterpretationPrompt": "Instructions for the LLM judge on how to interpret the before/after tree states."
}
```

No code changes are needed — the eval server discovers JSON files in `datasets/` automatically.
