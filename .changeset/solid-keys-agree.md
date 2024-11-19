---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
---
---
"section": feature
---

Enable Synchronous Child Datastore Creation

## Overview

This feature introduces a new pattern for creating datastores synchronously within the Fluid Framework. It allows for the synchronous creation of a child datastore from an existing datastore, provided that the child datastore is available synchronously via the existing datastore's registry and that the child's factory supports synchronous creation. This method also ensures strong typing for the consumer.

In this context, "child" refers specifically to the organization of factories and registries, not to any hierarchical or hosting relationship between datastores. The parent datastore does not control the runtime behaviors of the child datastore beyond its creation.

The synchronous creation of child datastores enhances the flexibility of datastore management within the Fluid Framework. It ensures type safety and provides a different way to manage datastores within a container. However, it is important to consider the overhead associated with datastores, as they are stored, summarized, garbage collected, loaded, and referenced independently. This overhead should be justified by the scenario's requirements.

Datastores offer increased capabilities, such as the ability to reference them via handles, allowing multiple references to exist and enabling those references to be moved, swapped, or changed. Additionally, datastores are garbage collected after becoming unreferenced, which can simplify final cleanup across clients. This is in contrast to subdirectories in a shared directory, which do not have native capabilities for referencing or garbage collection but are very low overhead to create.

Synchronous creation relies on both the factory and the datastore to support it. This means that asynchronous operations, such as resolving handles, some browser API calls, consensus-based operations, or other asynchronous tasks, cannot be performed during the creation flow. Therefore, synchronous child datastore creation is best limited to scenarios where the existing asynchronous process cannot be used, such as when a new datastore must be created in direct response to synchronous user input.

## Key Benefits

- **Synchronous Creation**: Allows for the immediate creation of child datastores without waiting for asynchronous operations.
- **Strong Typing**: Ensures type safety and better developer experience by leveraging TypeScript's type system.

## Use Cases

### Example 1: Creating a Child Datastore

In this example, we demonstrate how to support creating a child datastore synchronously from a parent datastore.

```typescript
/**
 * This is the parent DataObject, which is also a datastore. It has a
 * synchronous method to create child datastores, which could be called
 * in response to synchronous user input, like a key press.
 */
class ParentDataObject extends DataObject {
	createChild(name: string): ChildDataStore {
		assert(
			this.context.createChildDataStore !== undefined,
			"this.context.createChildDataStore",
		);

		const { entrypoint } = this.context.createChildDataStore(
			ChildDataStoreFactory.instance,
		);
		const dir = this.root.createSubDirectory("children");
		dir.set(name, entrypoint.handle);
		entrypoint.setProperty("childValue", name);

		return entrypoint;
	}

	getChild(name: string): IFluidHandle<ChildDataStore> | undefined {
		const dir = this.root.getSubDirectory("children");
		return dir?.get<IFluidHandle<ChildDataStore>>(name);
	}
}
```

For a complete example see the follow test:
https://github.com/microsoft/FluidFramework/blob/main/packages/test/local-server-tests/src/test/synchronousDataStoreCreation.spec.ts
