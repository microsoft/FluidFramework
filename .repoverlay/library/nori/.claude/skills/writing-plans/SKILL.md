---
name: Writing-Plans
description: Use when design is complete and you need detailed implementation tasks for engineers with zero codebase context - creates comprehensive implementation plans with exact file paths, complete code examples, and verification steps assuming engineer has minimal domain knowledge
---

<required>
CRITICAL. Add the following steps to your Todo list using TodoWrite:

- Read the 'Guidelines'.
- Create a comprehensive plan that a senior engineer can follow.
<system-reminder>Any absolute paths in your plan MUST take into account any worktrees that may have been created</system-reminder>
- Think about backwards compability. Add any notes to the plan.
- Think about edge cases. Add them to the plan.
- Think about questions or areas that require clarity. Add them to the plan.
- Emphasize how you will test your plan.
- Present plan to user.
</required>

# Guidelines

## Overview

Create a comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD.

Assume they are a talented developer. However, assume that they know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

Do not add code, but include enough detail that the necessary code is obvious.

Do not write a file to disk unless explicitly asked.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Test Section

Every plan MUST have a test section. This should be written first, and should
document how you plan to test the *behavior*.

```markdown

**Testing Plan**

I will add an integration test that ensures foo behaves like blah. The
integration test will mock A/B/C. The test will then call function/cli/etc.

I will add a unit test that ensures baz behaves like qux...
```

You should end EVERY testing plan section by writing:

```markdown
NOTE: I will write *all* tests before I add any implementation behavior.
```

<system-reminder>Your tests should NOT contain tests for datastructures or
types. Your tests should NOT simply test mocks. Always test actual behavior.</system-reminder>

<required>
For each test, follow this checklist:
- Ensure that the test does not just test mocks. If it does, remove the test and try again.
- Ensure the test does not test implementation detail. If it does, rewrite the test so that it tests boundary behavior.
- Ensure the test does not test data structure format or types. If it does, remove the test and try again.
- Ensure the test does not test for removed behavior. For example, if some behavior has been deprecated, do not write a test that simply confirms the behavior no longer works.
- Evaluate if the test treats the interior of the test boundary as a blackbox. You should not know anything about interior variables, function calls, or control flow.
</required>

## Plan Document Footer

**Every plan MUST end with this footer:**

```markdown
**Testing Details** [Brief description of what tests are being added and how they specifically test BEHAVIOR and NOT just implementation]

**Implementation Details** [maximum 10 bullets about key details]

**Question** [any questions or concerns that may be relevant that need answers]

---
```
