# Execution Isolation Investigation

Date: 2026-09-19
Status: Source investigation, mocked mechanism checks, and isolated task-process workaround probe complete; upstream remediation and shared-terminal live reproduction remain outstanding.

## Scope and Evidence

This investigation addresses repeated wrong-worktree output and interrupted commands in concurrent Rust-service workstreams.
It does not change runtime code, historical iteration dispositions, or the coordination recovery procedure.
The initial investigation did not interrupt an active workstream, attempt a concurrent shared-terminal reproduction, or file an upstream issue.
The task-based follow-up below tested only owned probe processes and informed the current coordination workaround.

The [0013 retrospective](iterations/0013/retrospective.md), [0014 retrospective](iterations/0014/retrospective.md), and [0015 retrospective](iterations/0015/retrospective.md) record recurrence despite checkout guards and isolated Cargo targets.
All five iteration 0015 workstream reports describe execution interference:

| Workstream | Recorded evidence |
| --- | --- |
| [Storage](iterations/0015/phase-2/storage.md#notable-events) | Three compilation attempts exited 130, one involved workloads, and a direct terminal returned core-session output. |
| [Transport](iterations/0015/phase-2/transport.md#notable-events) | Two delegated checks and one direct check exited 130; the direct run printed the storage branch. |
| [Core/session](iterations/0015/phase-2/core-session.md#notable-events) | Two lifecycle checks exited 130, and commit-hook output came from workloads. |
| [Decorators](iterations/0015/phase-2/decorators.md#notable-events) | Delegated checks were interrupted or returned transport-worktree output. |
| [Workloads](iterations/0015/phase-2/workloads.md#notable-events) | A guard reported decorators, two Cargo runs exited 130, and one terminal returned core-session output. |

These are overlapping incident reports, not a deduplicated failure count.
The session index identifies parent session `dc4e0bf7-83e6-4466-a2b2-f025bcf30528`, but its mounted debug log contains only the session header.
The original tool-call/result transcript, terminal identifiers, and cancellation events were not available here.
Consequently, the investigation does not attribute every historical failure to a particular call or rule out user cancellation in individual cases.

The source inspection uses VS Code revision `7debcd0e2acdea1c52de81bf9ee1620444407dda`, matching the mounted server installation.
The historical session header reports VS Code `1.138.0` and Copilot `0.66.0`, but does not establish the exact historical VS Code commit.

## Confirmed Mechanisms

### Terminal Ownership Is Chat-Scoped

The [general subagent tool](https://github.com/microsoft/vscode/blob/7debcd0e2acdea1c52de81bf9ee1620444407dda/src/vs/workbench/contrib/chat/common/tools/builtinTools/runSubagentTool.ts#L362) passes the parent's `sessionResource` to the subagent and separately supplies `subAgentInvocationId`.
The [execution subagent](https://github.com/microsoft/vscode/blob/7debcd0e2acdea1c52de81bf9ee1620444407dda/extensions/copilot/src/extension/tools/node/executionSubagentTool.ts#L55) likewise reuses the parent request and conversation session ID.

In [RunInTerminalTool](https://github.com/microsoft/vscode/blob/7debcd0e2acdea1c52de81bf9ee1620444407dda/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/runInTerminalTool.ts), `_sessionTerminalAssociations` is keyed by chat session resource.
`_initTerminal` reuses a live foreground terminal without checking for an active execution, reserving it, or distinguishing subagent owners.
Different generated execution IDs therefore do not imply different shells.
The inspected tool-service invocation path directly awaits the tool implementation; it does not add a per-terminal ownership lock.

This makes concurrent terminal calls from otherwise independent workstreams contend for one shell after that chat has a cached foreground terminal.
Separate Git worktrees isolate files, not terminal input, working directory, environment, output listeners, or cancellation.
A rule to serialize execution subagents within each workstream is insufficient if sibling workstreams still submit terminal calls concurrently under the same parent chat.

### Reuse Can Interrupt an Existing Command

[TerminalInstance.runCommand](https://github.com/microsoft/vscode/blob/7debcd0e2acdea1c52de81bf9ee1620444407dda/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts#L1003) waits for a prompt or a bounded shell-integration timeout.
It then sends ETX (Ctrl+C) when immediate execution is requested and command detection is absent or the prompt model contains text, before sending the new command.
This is a concrete mechanism for one caller to interrupt another command sharing the terminal; it does not require a Cargo failure or an explicit agent `kill_terminal` call.

The [rich execution strategy](https://github.com/microsoft/vscode/blob/7debcd0e2acdea1c52de81bf9ee1620444407dda/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/executeStrategy/richExecuteStrategy.ts#L106) explicitly documents this exit-130 mechanism.
Its stale-marker filter avoids accepting the completion of a command already running at strategy entry.
That filter does not provide exclusive terminal ownership: completion is not restricted to the requested command ID, and concurrent listeners established before either command starts can still accept the same completion event.
This latter interleaving is a source-level risk, not a captured historical trace.

### Preparation Can Remove Directory Binding

[CommandLineCdPrefixRewriter](https://github.com/microsoft/vscode/blob/7debcd0e2acdea1c52de81bf9ee1620444407dda/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/commandLineRewriter/commandLineCdPrefixRewriter.ts) removes a leading `cd <absolute-path> &&` when the path matches the terminal cwd observed during preparation.
Invocation later reacquires the session terminal and executes the prepared command without repeating that cwd check.
If another caller changes the shared shell directory between those steps, the command has lost its original directory binding.

This explains why an absolute `cd` prefix alone is not a sufficient guard under concurrent reuse.
Command-local options such as `git -C` and Cargo's absolute `--manifest-path` bind those individual commands, but do not isolate terminal signals or output attribution.
An isolated Cargo target addresses build artifacts and locking, not these shell-ownership failures.

## Focused Checks

A local scratch probe fetched the pinned upstream TypeScript, selected the actual class methods with the TypeScript parser, transpiled them, and executed them against mocked dependencies.
The probe remains at `rust-service/target/isolation-investigation/probe.mjs` in this checkout; it is ignored scratch evidence, not a committed regression suite.
Run it from any directory with Node using its absolute path.

| Check | Result |
| --- | --- |
| Two `_initTerminal` calls with one cached chat key and distinct execution/tool IDs | Both received mock terminal 41. |
| Different cached chat key | Received mock terminal 42, the negative control. |
| `rewrite` with matching preparation cwd | Removed the absolute `cd` and returned only `pwd`. |
| `rewrite` with a different preparation cwd | Preserved the original command by returning no rewrite. |
| `runCommand` with executing, nonempty prompt state and mocked prompt-wait expiry | Sent ETX followed by the new command. |
| `runCommand` with an empty input prompt | Sent only the new command. |

All assertions passed.
The prefix parser was stubbed with the correct parsed form of the known input; no parser correctness claim is made.
The timeout dependency resolved immediately to exercise the expiry path; no real waiting, signal delivery, shell, or worktree mutation was involved.
These tests confirm the component mechanisms, not an end-to-end reproduction or complete historical attribution.

Fetched-source SHA-256 values:

- `runInTerminalTool.ts`: `b51d70ac252ab325b7c9d6e1025000073305c73a2315756debe2076077e22bde`.
- `commandLineCdPrefixRewriter.ts`: `82e1436b5e0e989187575bd2f08e305492c45bca95b3a62f9f1ba75b57c98462`.
- `terminalInstance.ts`: `0814b324675678eb11096cbd4d3e4ec864aadc290da5cd352c7fe50e53f3ae4d`.

## Recommended Remediation

Treat this as an execution-tool ownership problem, not simply insufficient worktree instructions.
The strongest supported explanation for the repeated incidents is concurrent reuse of a parent-chat foreground terminal, amplified by preparation-time directory rewriting and completion-event attribution.
The available evidence does not prove that every exit 130 or foreign result has this cause.

The upstream fix should provide an exclusive terminal lease per execution or a per-owner queue, including protection against concurrent calls by the same owner.
Terminal selection must use the effective subagent owner where appropriate, preserve or revalidate directory binding at execution, match completion to command identity, and restrict cancellation to the owning execution.
Allocating terminals per subagent alone would not protect concurrent calls within that subagent.

Before claiming a fix, run an integration regression in an isolated VS Code test window with no user workloads.
Warm the foreground terminal, start two commands with distinct markers and directories under one parent chat, and record requested/prepared commands, session/subagent/tool/terminal IDs, shell and child PIDs, cwd, completion IDs, and cancellation events.
Verify that neither command interrupts the other, each result contains only its own marker, directory bindings survive a preparation/execution interleaving, and cancelling one execution leaves the other intact.
Retain a separate-chat control and the non-overlapping sequential control.

Until terminal ownership is fixed, the recovery-procedure work should coordinate terminal execution across the whole parent chat, not merely within individual agents.
Parallel editing and read-only file tools can remain independent.
Do not use asynchronous mode for one-shot builds just to obtain a separate terminal; that conflicts with the tool's current execution contract.
An isolated Cargo target remains useful, but is not a substitute for exclusive terminal ownership.

Investigation is complete at source and mocked-component level.
The recovery procedure, an upstream fix/report, and live regression validation remain separate follow-up work.

## Task-Based Workaround Follow-Up

The user requested a workaround that preserves parallel workstreams rather than serializing whole implementations.
The available tools offer these practical choices:

| Tool | Relevant capability and limitation |
| --- | --- |
| `run_in_terminal` | No foreground terminal allocation or target-ID parameter; subject to the shared-cache issue. |
| `send_to_terminal` | Can target an existing execution ID, but does not allocate an isolated foreground execution or supply command-specific completion tracking. |
| `create_and_run_task` | Creates and runs a shell task, but its exposed schema does not include cwd, environment, dedicated-panel, or compound-dependency options. |
| `run_task` | Runs a registered task by workspace folder and task ID; full process-task options can be configured in the workspace task file. |
| `get_task_output` | Addresses tasks by ID, but returned blank output for both completed probe tasks. |

Temporary registered process tasks used explicit Node argument arrays, distinct labels, absolute working directories, separate environment markers, and dedicated panels.
The probe asserted cwd and environment, wrote ready records, and waited for its peer through filesystem notifications with a bounded failure deadline.
It saved separate result records with process IDs, timestamps, directories, environment markers, and intended exit codes.

Launching two `run_task` calls through the parallel tool wrapper did not overlap their execution in this environment.
The first probe timed out before the second began; this result is not evidence of task-process corruption, but it rules out assuming that parallel tool calls guarantee concurrent launches.

A compound task with `dependsOn` naming both children and `dependsOrder: parallel` passed the rendezvous check through one `run_task` invocation:

| Owner | PID | Start (Unix ms) | Finish (Unix ms) | cwd | Exit |
| --- | --- | --- | --- | --- | --- |
| alpha-compound | 109983 | 1789842063947 | 1789842063948 | `/workspaces/FluidFramework` | 0 |
| beta-compound | 109985 | 1789842063948 | 1789842063948 | `/workspaces/FluidFramework/rust-service` | 7, intentional |

Each launch result contained only its corresponding marker and matched its assigned environment.
The tool reported beta's intentional nonzero exit as "failed to launch" even though the process ran and produced its expected record; inspect the actual output and exit code rather than that wording alone.
An independent assertion check verified distinct process IDs, overlapping lifetimes, cwd, environment, and exit-code records.
No existing workstream or user terminal was interrupted.
Probe scripts and JSON evidence remain local, ignored scratch files under `rust-service/target/isolation-investigation/`; temporary task registrations were removed after validation.

The practical recommendation is to pre-register distinct process tasks for workstreams, run focused checks through assigned task IDs, and use compound tasks when ready checks must launch concurrently.
Use fresh per-run log/result paths and preserve the launch output; do not rely on later terminal-history retrieval.
Serialize only calls through the shared foreground terminal, not independent task processes or whole workstreams.
The coordinator owns shared task configuration and registers sibling-worktree commands in the loaded workspace using absolute cwd and executable paths.

This probe does not establish autonomous cross-subagent scheduling, task cancellation isolation, long-running build behavior, or an upstream shared-terminal fix.
Those remain explicit limits; a batch boundary may reduce scheduling flexibility, and no iteration-throughput improvement has been measured.
The [coordination skill](../../.github/skills/rust-service-coordination/SKILL.md#terminal-coordination) and generated workstream instructions now contain the task-based workaround and recovery procedure, superseding the initial serialization-only recommendation above.