---
"@fluidframework/aqueduct": major
"@fluidframework/data-object-base": major
---

ContainerRuntimeFactory constructors have changed

The following class constructors have been changed to allow for better flexible in arguments passed:

-   `BaseContainerRuntimeFactory`
-   `ContainerRuntimeFactoryWithDefaultDataStore`
-   `RuntimeFactory`

They now use a single object for constructor params. Example change to be made:

```ts
// Old
new BaseContainerRuntimeFactory(
	myRegistryEntries,
	myDependencyContainer,
	myRequestHandlers,
	myRuntimeOptions,
	myProvideEntryPoint,
);

// New
new BaseContainerRuntimeFactory({
	registryEntries: myRegistryEntries,
	dependencyContainer: myDependencyContainer,
	requestHandlers: myRequestHandlers,
	runtimeOptions: myRuntimeOptions,
	provideEntryPoint: myProvideEntryPoint,
});
```
