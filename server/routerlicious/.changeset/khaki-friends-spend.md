---
"@fluidframework/server-lambdas": "minor"
---

server-lambdas: Fix: cover edge cases for scrubbed checkpoint users

Overhauled how the Scribe lambda handles invalid, missing, or outdated checkpoint data via fallbacks.

Before:

```
if (no global checkpoint)
  use Default checkpoint
elsif (global checkpoint was cleared or  global checkpoint quorum was scrubbed)
  use Summary checkpoint
else
  use latest DB checkpoint (local or global)
```

After:

```
if (no global and no local checkpoint and no summary checkpoint)
  use Default checkpoint
elsif (
	global checkpoint was cleared and summary checkpoint ahead of local db checkpoint
	or latest DB checkpoint quorum was scrubbed
	or summary checkpoint ahead of latest DB checkpoint
)
  use Summary checkpoint
else
  use latest DB checkpoint (local or  global)
```

Also: Updated `CheckpointService` with additional fallback logic for loading a checkpoint from local or global DB
depending on whether the quorum information in the checkpoint is valid (i.e. does not contain scrubbed users).

You can find more details in [pull request #20259](https://github.com/microsoft/FluidFramework/pull/20259).
