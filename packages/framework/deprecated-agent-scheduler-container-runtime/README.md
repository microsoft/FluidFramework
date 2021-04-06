# @fluidframework/deprecated-agent-scheduler-container-runtime

## makeContainerRuntimeWithAgentScheduler()

The helper `makeContainerRuntimeWithAgentScheduler()` is a backwards-compatible equivalent to `ContainerRuntime.load()` with an `AgentScheduler` built-in.  It is deprecated for new use.  You should only use it if your scenario requires backwards compatibility with documents that were produced before `AgentScheduler` was removed from `ContainerRuntime` (in version 0.38).  If you have a new scenario that would like to use `AgentScheduler`, you can import `AgentSchedulerFactory` directly and use with `ContainerRuntime.load()`.  See the shared-text example for an example of this recommended pattern.

## Agent scheduler container runtime factories

The agent scheduler container runtime factories use a backwards compatible `ContainerRuntime` with `AgentScheduler` built-in.  These are deprecated for new use.  You should only use these if your scenario requires backwards compatibility with documents that were produced before `AgentScheduler` was removed from `ContainerRuntime` (in version 0.38).  If you have a new scenario that would like to use `AgentScheduler`, you can import it directly and use with the non-legacy versions of the container runtime factories.

These will be removed in an upcoming release, so it is recommended to migrate to the normal container runtime factories in `@fluidframework/aqueduct`.  This can be done by updating your subclass of these factories to include the `AgentSchedulerFactory` in its registry and instantiate it on `containerInitializingFirstTime()`.
