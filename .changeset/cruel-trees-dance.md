---
"@fluidframework/container-definitions": major
"@fluidframework/container-loader": major
"@fluidframework/container-runtime": major
---

Audience & connection sequencing improvements

Here are breaking changes in Audience behavior:
1. IAudience no longer implements EventEmmiter. If you used addListener() or removeListener(), please replace with on() & off() respectively.
2. IAudience interface implements getSelf() method and "selfChanged" event.
3. IContainerContext.audience is no longer optional
4. "connected" events are now raised (various API surfaces - IContainer, IContainerRuntime, IFluidDataStoreRuntime, etc.) a bit later in reconnection sequence for "read" connections - only after client receives its own "join" signal and caught up on ops, which makes it symmetrical with "write" connections.
- If this change in behavior breaks some scenario, please let us know immediately, but you can revert that behavior using the following feature gates:
	- "Fluid.Container.DisableCatchUpBeforeDeclaringConnected"
	- "Fluid.Container.DisableJoinSignalWait"
