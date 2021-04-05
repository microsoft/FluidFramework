# Legacy container runtime factories

The legacy container runtime factories use the backwards compatible `ContainerRuntime` with `AgentScheduler` built-in.  These are deprecated for new use.  You should only use these if your scenario requires backwards compatibility with documents that were produced before `AgentScheduler` was removed from `ContainerRuntime`.  If you have a new scenario that would like to use `AgentScheduler`, you can import it directly and use with the non-legacy versions of the container runtime factories.
