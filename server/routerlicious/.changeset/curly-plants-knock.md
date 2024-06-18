---
"@fluidframework/server-lambdas": "minor"
---

server-lambdas: Performance: Keep pending checkpoint message for future summaries

During a session there may be multiple client/service summary calls, and independently, multiple checkpoints. Checkpoint
will clear messages storage in `pendingCheckpointMessages`, which is also used for writing summaries. Because of this
cleanup, when we write new summaries, it often needs to request the ops from Alfred again, which is not quite
efficient.

Now the pending messages are cached for improved performance.

You can find more details in [pull request #20029](https://github.com/microsoft/FluidFramework/pull/20029).
