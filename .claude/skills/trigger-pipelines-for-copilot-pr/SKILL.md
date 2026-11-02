---
name: trigger-pipelines-for-copilot-pr
description: >-
  Trigger Azure DevOps pipelines for a Copilot-created pull request.
  Use when the user asks to trigger CI pipelines for a specific pull request.
---

Accept a positive pull request number or a URL in the form `https://github.com/microsoft/FluidFramework/pull/<number>`.
Before extracting a number from a URL, verify that its host is `github.com` and its repository is `microsoft/FluidFramework`.
Reject URLs for other hosts or repositories and unsupported URL formats without running either script.
A bare number targets `microsoft/FluidFramework`.

Both scripts post two separate `/azp run` comments to the specified pull request.
The comments must match `scripts/pipeline-commands.txt` exactly, without preambles or markers.
If applicable instructions prohibit posting those exact comments, do not run either script.
Explain the conflict and provide the commands for the user to post manually.

Prefer the GitHub CLI when `gh` is available:

```sh
sh <skill-directory>/scripts/trigger-pipelines-gh.sh <pr-number>
```

If `gh` is unavailable, use `curl` with an existing `GITHUB_TOKEN` environment variable:

```sh
sh <skill-directory>/scripts/trigger-pipelines-curl.sh <pr-number>
```

Run only one script.
If neither method is available, report the missing prerequisite.
If a script fails, report the failure instead of retrying automatically, because the first comment might already have been posted.
