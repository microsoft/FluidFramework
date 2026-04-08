---
name: Fluid Release Skill Dispatcher
description: Dispatches Fluid release workflows via safe outputs.
on:
  schedule: daily on weekdays
  workflow_dispatch:
    inputs:
      workflow:
        description: "Workflow to dispatch (push-tag-create-release, release-approval, release-notes-issue, or all)"
        required: true
      tag:
        description: "Tag for push-tag-create-release (required when selected)"
        required: false
      pr:
        description: "PR number for release-approval (required when selected)"
        required: false
permissions:
  actions: read
engine:
  id: copilot
  model: claude-opus-4.6
safe-outputs:
  dispatch-workflow:
    workflows:
      - push-tag-create-release
      - release-approval
      - release-notes-issue
    max: 3
---

# Fluid Release Skill Dispatcher

Use the trigger context and user inputs to dispatch release workflows in this repository.

## Inputs

- `workflow`: one of `push-tag-create-release`, `release-approval`, `release-notes-issue`, or `all`
- `tag`: required when dispatching `push-tag-create-release`
- `pr`: required when dispatching `release-approval`

## Behavior

1. Read `${{ github.event.inputs.workflow }}`, `${{ github.event.inputs.tag }}`, and `${{ github.event.inputs.pr }}`.
2. If `${{ env.GH_AW_GITHUB_EVENT_NAME }}` is `schedule`, dispatch `release-notes-issue` with no inputs, then stop.
3. If `workflow` is `all`, dispatch:
   - `release-notes-issue` (no inputs)
   - `release-approval` with `{ "pr": "<pr>" }` only when `pr` is provided
   - `push-tag-create-release` with `{ "tag": "<tag>" }` only when `tag` is provided
4. If `workflow` is a single value:
   - `release-notes-issue`: dispatch with no inputs
   - `release-approval`: require `pr` and dispatch with `{ "pr": "<pr>" }`
   - `push-tag-create-release`: require `tag` and dispatch with `{ "tag": "<tag>" }`
5. If required inputs are missing for the selected workflow, do not dispatch that workflow and explain what is missing.
6. Use safe outputs only for dispatching workflows.

## Output format

Emit `dispatch_workflow` safe outputs using:

- `workflow_name`: workflow file name without extension
- `inputs`: optional key/value object for workflow inputs
