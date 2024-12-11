---
"@fluidframework/azure-client": minor
"@fluidframework/container-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/fluid-runner": minor
"@fluidframework/odsp-client": minor
"@fluid-experimental/property-dds": minor
"@fluid-private/test-end-to-end-tests": minor
"@fluidframework/test-utils": minor
"@fluidframework/tinylicious-client": minor
"@fluidframework/tree": minor
---
---
"section": feature
---

New APIs to create and load containers without using the Loader object

#### Overview

Provide standalone APIs to create and load containers instead of using the Loader object to do so. Earlier hosts were
supposed to create the Loader object first and then call methods on it to create and load containers. Now they can just
utilize these APIs directly and get rid of the Loader object.

##### Use `createDetachedContainer` to create a detached container

```typescript
export async function createDetachedContainer(
	createDetachedContainerProps: ICreateDetachedContainerProps,
): Promise<IContainer> {}
```

`ICreateDetachedContainerProps` are the properties that needs to be supplied to the above API which contains props like
URL Resolver, IDocumentServiceFactory, etc., which were previously used to create the `Loader` object.

##### Use `loadExistingContainer` to load an existing container

```typescript
export async function loadExistingContainer(
	loadExistingContainerProps: ILoadExistingContainerProps,
): Promise<IContainer> {}
```

`ILoadExistingContainerProps` are the properties that needs to be supplied to the above API which contains props like
URL Resolver, IDocumentServiceFactory, etc., which were earlier used to create the `Loader` object.

##### Use `rehydrateDetachedContainer` to create a detached container from a serializedState of another container

```typescript
export async function rehydrateDetachedContainer(
	rehydrateDetachedContainerProps: IRehydrateDetachedContainerProps,
): Promise<IContainer> {}
```

`IRehydrateDetachedContainerProps` are the properties that needs to be supplied to the above API which contains props like
URL Resolver, IDocumentServiceFactory, etc., which were earlier used to create the `Loader` object.

##### Note on `ICreateAndLoadContainerProps`.

The props which were used to create the `Loader` object are now moved to the `ICreateAndLoadContainerProps` interface.
`ICreateDetachedContainerProps`, `ILoadExistingContainerProps` and `IRehydrateDetachedContainerProps` which extends
`ICreateAndLoadContainerProps` also contains some additional props which will be used to create and load containers like
`IFluidCodeDetails`, `IRequest`, etc. Previously these were directly passed when calling APIs like
`Loader.createDetachedContainer`, `Loader.resolve` and `Loader.rehydrateDetachedContainerFromSnapshot` on the `Loader`
object. Also, `ILoaderProps.ILoaderOptions` are not replaced with `ICreateAndLoadContainerProps.IContainerPolicies`
since there will be no concept of `Loader`.
