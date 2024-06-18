---
"@fluidframework/protocol-base": "minor"
---

protocol-base: Fix: configure user data scrubbing in checkpoints and summaries

_Note: This change is primarily internal to routerlicious._

- When scribe boots from a checkpoint, it fails over to the latest summary checkpoint if the quorum is corrupted (i.e.
	user data is scrubbed).
- When scribe writes a checkpoint to DB or a summary, it respects new `IScribeServerConfiguration` options
  (scrubUserDataInSummaries, scrubUserDataInLocalCheckpoints, and scrubUserDataInGlobalCheckpoints) when determining
  whether to scrub user data in the quorum.
- Added optional param, `scrubUserData`, to `ProtocolOpHandler.getProtocolState()`. When `true`, user data in the quorum
  is replaced with `{ id: "" }`. Defaults to `false`. Previously was always scrubbed.
- Added the following configuration options for `IScribeServerConfiguration`:
	- scrubUserDataInSummaries
	- scrubUserDataInLocalCheckpoints
	- scrubUserDataInGlobalCheckpoints

	All default to `false`.

You can find more details in [pull request #20150](https://github.com/microsoft/FluidFramework/pull/20150).
