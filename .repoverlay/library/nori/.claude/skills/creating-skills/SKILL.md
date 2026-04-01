---
name: Creating-Skills
description: Use when you need to create a new custom skill for a profile - guides through gathering requirements, creating directory structure, writing SKILL.md, and optionally adding bundled scripts
---

<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:

1. Gather skill requirements from me
2. Select target profile
3. Create skill directory structure
4. Write SKILL.md with proper frontmatter
5. (Optional) Write and bundle scripts
6. Instruct the user to run /nori-switch-profile to switch profiles.
</required>

# Overview

This skill guides you through creating custom skills that persist across sessions. Skills are stored in profile directories and can include markdown instructions, checklists, and optional bundled scripts.

# Writing Skills

Every skill must start with a required checklist block:

```
<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:
1. <step 1>
2. <step 2>
...
</required>
```

This is the *most important* part of a skill.

Each step may have guidelines underneath. For example:
```
1. Create a directory.

Use `mkdir foo/bar`

2. Make a file.

...
```

# Writing scripts

Skills may be bundled with scripts. Scripts are simple code cli tools that do various things deterministically.

Any scripts you write should be entirely self contained. Ask the user which
language they prefer.

The scripts should be callable from the Bash tool.

The script should be stored in the same place as the skill. Add a section to the
SKILL.md on how to use the script. If the script is required to be called, add
that instruction to the <required> block.

# Tools and Code

Document which tools are necessary for the skill.

The SKILL should explicitly encourage writing code. The agent should be told to write code to call a tool any time the agent needs to call any tools more than once. The agent should write code instead of calling tools itself.

Steps that reference tools and APIs should inline them in the step by step process.

<good-example>
- Write a python script that uses the slack api to pull my unread messages. The script should write my messages to a folder, /home/foobar/daily-analysis/<DD-MM-YYYY>/slack
- Write a python script that uses the gmail api to pull my inbox. The script should write my emails to a folder, /home/foobar/daily-analysis/<DD-MM-YYYY>/email
- Write a python script to identify the most urgent messages that I need to respond to.
<system-reminder> Auth credentials can be found at /home/foobar/authentication/auth.txt
</good-example>

<bad-example>
**Tools**: Slack, Gmail API
- Summarize my messages by looking through common surfaces that I may use for messages.
</bad-example>

<good-example>
Read https://raw.githubusercontent.com/tilework-tech/nori-skillsets/96012bcfcd9482b248debed7b9a7fc7c345f76e1/src/cli/features/claude-code/profiles/config/amol/skills/finishing-a-development-branch/SKILL.md
</good-example>

<good-example>
Read https://raw.githubusercontent.com/tilework-tech/nori-skillsets/96012bcfcd9482b248debed7b9a7fc7c345f76e1/src/cli/features/claude-code/profiles/config/amol/skills/webapp-testing/SKILL.md
</good-example>
