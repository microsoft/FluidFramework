---
name: Brainstorming
description: IMMEDIATELY USE THIS SKILL when creating or develop anything and before writing code or implementation plans - refines rough ideas into fully-formed designs through structured Socratic questioning, alternative exploration, and incremental validation
---

# Brainstorming Ideas Into Designs

## Overview

Transform rough ideas into fully-formed designs through structured questioning and alternative exploration.

**Core principle:** Ask questions to understand, explore alternatives, present design incrementally for validation.

**Announce at start:** "I'm using the Nori Brainstorming skill to refine your idea into a design."

## The Process

### Phase 1: Understanding

- Check current project state in working directory
- Ask ONE question at a time to refine the idea
- Prefer multiple choice when possible
- Gather: Purpose, constraints, success criteria

### Phase 2: Exploration

- Propose 2-3 different approaches
- For each: Core architecture, trade-offs, complexity assessment
- Ask your human partner which approach resonates

### Phase 3: Design Presentation

- Present in 200-300 word sections
- Cover: Architecture, components, data flow, error handling, testing
- Ask after each section: "Does this look right so far?"

### Phase 4: Worktree Setup (for implementation)

When design is approved and implementation will follow:

- Announce: "I'm using the Using Git Worktrees skill to set up an isolated workspace."
- Switch to {{skills_dir}}/using-git-worktrees
- Follow that skill's process for directory selection, safety verification, and setup
- Return here when worktree ready

### Phase 5: Planning Handoff

Ask: "Ready to create the implementation plan?"

When your human partner confirms (any affirmative response):

- Announce: "I'm using the Writing Plans skill to create the implementation plan."
- Switch to {{skills_dir}}/writing-plans skill
- Create detailed plan in the worktree

## When to Revisit Earlier Phases

**You can and should go backward when:**

- Partner reveals new constraint during Phase 2 or 3 → Return to Phase 1 to understand it
- Validation shows fundamental gap in requirements → Return to Phase 1
- Partner questions approach during Phase 3 → Return to Phase 2 to explore alternatives
- Something doesn't make sense → Go back and clarify

**Don't force forward linearly** when going backward would give better results.

## Remember

- One question per message during Phase 1
- Apply YAGNI ruthlessly
- Explore 2-3 alternatives before settling
- Present incrementally, validate as you go
- Go backward when needed - flexibility > rigid progression
- Announce skill usage at start
