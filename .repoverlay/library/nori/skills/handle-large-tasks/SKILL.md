---
name: Handle-Large-Tasks
description: Use this skill to split large plans into smaller chunks. This skill manages your context window for large tasks. Use it when a task will take a long time and cause context issues.
---

<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:

- Announce that you are creating subagents.
- Construct a plan for each subagent.
- Write a test for each subagent based on what you expect the subagent to do.
- Start each subagent using the Task tool with instructions to make the test pass.
  - Subagents may come back and ask questions or present plans. Review and provide feedback.
  - You may have to restart subagents. If that happens, simply pass in the previous produced plan.
- Evaluate the code the subagent produces. Give feedback. Iterate until tests pass AND the code fits.
- When all subagents complete, make sure all tests pass and all of the code fits together coherently.
</required>

# Guidelines

Use subagents to manage your context.
Each subagent has its own limited context window.
Subagents perform best when they have clear implementation guidelines. Each subagent should be given a small and precise task.
Create tests for each subagent and explicitly tell the subagent that it is responsible for making sure that test passes. The tests should test behavior.
You are responsible for the final output. That means you MUST ensure that everything runs as expected. You should create high level tests that validate overall behavior.
