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

The synchronous creation of child datastores enhances the flexibility of datastore management within the Fluid Framework. It ensures type safety and provides a more efficient way to manage datastores within a container. However, it is important to consider the overhead associated with datastores, as they are stored, summarized, garbage collected, loaded, and referenced independently. This overhead should be justified by the scenario's requirements.

Datastores offer increased capabilities, such as the ability to reference them via handles, allowing multiple references to exist and enabling those references to be moved, swapped, or changed. Additionally, datastores are garbage collected after becoming unreferenced, which can simplify final cleanup across clients. This is in contrast to subdirectories in a shared directory, which do not have native capabilities for referencing or garbage collection but are very low overhead to create.

Synchronous creation relies on both the factory and the datastore to support it. This means that asynchronous operations, such as resolving handles, some browser API calls, consensus-based operations, or other asynchronous tasks, cannot be performed during the creation flow. Therefore, synchronous child datastore creation is best limited to scenarios where the existing asynchronous process cannot be used, such as when a new datastore must be created in direct response to synchronous user input.

## Key Benefits

- **Synchronous Creation**: Allows for the immediate creation of child datastores without waiting for asynchronous operations.
- **Strong Typing**: Ensures type safety and better developer experience by leveraging TypeScript's type system.

## Use Cases

### Example 1: Creating a Child Datastore

In this example, we demonstrate how to support creating a child datastore synchronously from a parent datastore.

```typescript
import {
    IFluidDataStoreFactory,
    IFluidDataStoreContext,
    IFluidDataStoreRuntime,
    IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/core-utils";

class ChildDataStore {
    public static create(runtime: IFluidDataStoreRuntime) {
        const root = SharedMap.create(runtime, "root");
        root.bindToContext();
        return new ChildDataStore(runtime, root);
    }

    public static async load(runtime: IFluidDataStoreRuntime) {
        const root = (await runtime.getChannel("root")) as unknown as ISharedMap;
        return new ChildDataStore(runtime, root);
    }

    private constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        public readonly sharedMap: SharedMap,
    ) {}

    get handle() {
        return this.runtime.entryPoint;
    }
}

class ChildDataStoreFactory implements IFluidDataStoreFactory {
    static readonly instance = new ChildDataStoreFactory();
    private constructor() {}

    get IFluidDataStoreFactory() {
        return this;
    }

    public readonly type = "ChildDataStore";

    async instantiateDataStore(context: IFluidDataStoreContext, existing: boolean) {
        const runtime: IFluidDataStoreRuntime = new FluidDataStoreRuntime(
            context,
            sharedObjectRegistry,
            existing,
            async () => dataStore,
        );
        const dataStore = existing ? ChildDataStore.load(runtime) : ChildDataStore.create(runtime);

        return runtime;
    }

    createDataStore(context: IFluidDataStoreContext) {
        runtime: IFluidDataStoreChannel;
        entrypoint: ChildDataStore;
    } {
        const runtime = new FluidDataStoreRuntime(context, new Map(), false, async () => entrypoint);
        const entrypoint = ChildDataStore.create(runtime);
        return { runtime, entrypoint };
    }
}

class ParentDataObject extends DataObject {
    protected async initializingFirstTime() {
        this.createChild("initialChild");
    }

    createChild(name: string): ChildDataStore {
        assert(this.context.createChildDataStoreSync !== undefined, "createChildDataStoreSync is not defined");
        const { entrypoint } = this.context.createChildDataStoreSync(ChildDataStoreFactory.instance);
        const dir = this.root.createSubDirectory("children");
        dir.set(name, entrypoint.handle);
        entrypoint.sharedMap.set("childValue", name);
        return entrypoint;
    }

    getChild(name: string): IFluidHandle<ChildDataStore> | undefined {
        const dir = this.root.getSubDirectory("children");
        return dir?.get<IFluidHandle<ChildDataStore>>(name);
    }
}

const parentDataObjectFactory = new DataObjectFactory(
    "ParentDataObject",
    ParentDataObject,
    [],
    {},
    [[ChildDataStoreFactory.instance.type, ChildDataStoreFactory.instance]],
);
```
