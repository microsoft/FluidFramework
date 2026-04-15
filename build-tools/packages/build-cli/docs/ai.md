`flub ai`
=========

AI-powered assistant for launching the right AI agent.

* [`flub ai`](#flub-ai)

## `flub ai`

AI-powered assistant that helps you launch the right AI agent.

```
USAGE
  $ flub ai [-v | --quiet] [--aliasFile <value>] [--githubToken <value>] [--launchFile <value>] [--model
    <value>]

FLAGS
  --aliasFile=<value>    [env: FLUB_AI_ALIAS_FILE] Path to the agent-aliases.sh file. Defaults to the AI-enabled
                         Codespace locations.
  --githubToken=<value>  [env: COPILOT_GITHUB_TOKEN] GitHub token for the launcher assistant. Defaults to
                         COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN.
  --launchFile=<value>   Write the launch command to this file instead of executing it. Used by shell wrappers to run
                         the alias as a separate process.
  --model=<value>        The AI model to use for the launcher assistant. Defaults to the model specified in
                         launcher-prompt.md frontmatter.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  AI-powered assistant that helps you launch the right AI agent.

EXAMPLES
  Launch the AI assistant to help pick the right agent.

    $ flub ai

  Use a specific model for the launcher assistant.

    $ flub ai --model claude-sonnet-4.5
```

_See code: [src/commands/ai.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/ai.ts)_
