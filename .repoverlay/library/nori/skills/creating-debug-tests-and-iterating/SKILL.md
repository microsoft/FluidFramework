---
name: creating-debug-tests-and-iterating
description: Use this skill when faced with a difficult debugging task where you need to replicate some bug or behavior in order to see what is going wrong.
---

<required>
*CRITICAL* Add the following steps to your Todo list using TodoWrite:

<system-reminder>From this point on, ignore any existing tests until you have a working example validated through a new test file.</system-reminder>
1. Write a script that interacts with the application *from the outside*. The script should not call any internals. It should only interact with the external interfaces.
2. Check to see if you require authentication. If you do, ask me for credentials.
<system-reminder>Do NOT use mock mode or test harnesses. You should be testing the real thing.</system-reminder>
3. Follow these steps in a loop until the bug is fixed:
  - Add many logs to the application. You *MUST* do this on every loop.
  - Run the debug script.
  - Analyze the output: read logs, identify errors, do whatever you need to.
  - Update the debug script.
<system-reminder>If you get stuck: did you add logs?</system-reminder>
5. Identify and fix the issue at hand.
6. Clean up all background jobs, and remove extraneous logs.
7. Make sure other tests pass.
</required>

# Debug Testing

To test different kinds of applications, write scripts that test the
application interfaces. Your testing should be as close to 'real' as possible.

## Example

Identify the application boundary to be tested and the tools you need to test
it.

**CLI Tool:**

```bash
./path/to/cli.sh arg1 arg2
```

```python
subprocess.run(["./path/to/cli.sh", "arg1", "arg2"])
```

```node
exec('./path/to/cli.sh', (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
  console.error(`stderr: ${stderr}`);
});
```

**API:**

Start the server:
```bash
cd backend && python server.py&
cd frontend && npm run dev&
```

Call to the server using scripting language of choice.

Do NOT get in a loop where you just keep running other tests. In this mode, you
should ignore other tests entirely until it works.

# Emulators for testing

Web servers or web apps: use playwright (read the {{skills_dir}}/webapp-testing/SKILL.md)
TUI tools: use tmux with screen capture
CLI tools: use bash
