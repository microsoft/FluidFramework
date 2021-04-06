# @fluidframework/deprecated-agent-scheduler-container-runtime

## Agent scheduler container runtime factories

The agent scheduler container runtime factories use the backwards compatible `ContainerRuntime` with `AgentScheduler` built-in.  These are deprecated for new use.  You should only use these if your scenario requires backwards compatibility with documents that were produced before `AgentScheduler` was removed from `ContainerRuntime`.  If you have a new scenario that would like to use `AgentScheduler`, you can import it directly and use with the non-legacy versions of the container runtime factories.

These will be removed in an upcoming release, so it is recommended to migrate to the normal container runtime factories in `@fluidframework/aqueduct`.  This can be done by updating your subclass of these factories to include the `AgentScheduler` in its registry and instantiate it on `containerInitializingFirstTime()`.  See `makeContainerRuntimeWithAgentScheduler()` for more details.
