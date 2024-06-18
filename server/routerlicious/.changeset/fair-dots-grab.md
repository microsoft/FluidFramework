---
"@fluidframework/protocol-base": "minor"
---

protocol-base: Fix: ensure immutability of quorum snapshot

Creates a deeper clone of the quorum members when snapshotting to make sure the snapshot is immutable.

You can find more details in [pull request #20329](https://github.com/microsoft/FluidFramework/pull/20329).
