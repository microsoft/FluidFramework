# @fluidframework/agent-scheduler

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->
<!-- AUTO-GENERATED-CONTENT:END -->

## AgentScheduler

The `AgentScheduler` is a data object that can be used to assign tasks to unique clients.

### Creation

To create an `AgentScheduler` as a child instance of your data object, add the factory to your registry and call the static `createChildInstance` function on the factory. You can then retrieve and store its handle to access it later:

```typescript
// In your Data Object
protected async initializingFirstTime() {
    const agentScheduler = await AgentSchedulerFactory.createChildInstance(this.context);
    this.root.set("agentScheduler", agentScheduler.handle);
}

// When creating your DataObjectFactory
export const MyDataObjectFactory = new DataObjectFactory(
    "my-data-object",
    MyDataObject,
    [],
    {},
    new Map([
      AgentSchedulerFactory.registryEntry,
    ]),
);
```

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->
<!-- AUTO-GENERATED-CONTENT:END -->

