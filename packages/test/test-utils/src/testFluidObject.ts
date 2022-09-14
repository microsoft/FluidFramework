/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultFluidObjectRequestHandler } from "@fluidframework/aqueduct";
import { IRequest, IResponse, IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidObjectHandle, FluidDataStoreRuntime, mixinRequestHandler } from "@fluidframework/datastore";
import { SharedMap, ISharedMap } from "@fluidframework/map";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ITestFluidObject } from "./interfaces";

/**
 * A test Fluid object that will create a shared object for each key-value pair in the factoryEntries passed to load.
 * The shared objects can be retrieved by passing the key of the entry to getSharedObject.
 * It exposes the IFluidDataStoreContext and IFluidDataStoreRuntime.
 */
export class TestFluidObject implements ITestFluidObject {
    public static async load(
        runtime: IFluidDataStoreRuntime,
        channel: IFluidDataStoreChannel,
        context: IFluidDataStoreContext,
        factoryEntries: Map<string, IChannelFactory>,
        existing: boolean,
    ) {
        const fluidObject = new TestFluidObject(runtime, channel, context, factoryEntries);
        await fluidObject.initialize(existing);

        return fluidObject;
    }

    public get ITestFluidObject() {
        return this;
    }

    public get IFluidLoadable() {
        return this;
    }

    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    public root!: ISharedMap;
    private readonly innerHandle: IFluidHandle<this>;

    /**
     * Creates a new TestFluidObject.
     * @param runtime - The data store runtime.
     * @param context - The data store context.
     * @param factoryEntries - A list of id to IChannelFactory mapping. For each item in the list,
     * a shared object is created which can be retrieved by calling getSharedObject() with the id;
     */
    constructor(
        public readonly runtime: IFluidDataStoreRuntime,
        public readonly channel: IFluidDataStoreChannel,
        public readonly context: IFluidDataStoreContext,
        private readonly factoryEntriesMap: Map<string, IChannelFactory>,
    ) {
        this.innerHandle = new FluidObjectHandle(this, "", runtime.objectsRoutingContext);
    }

    /**
     * Retrieves a shared object with the given id.
     * @param id - The id of the shared object to retrieve.
     */
    public async getSharedObject<T = any>(id: string): Promise<T> {
        if (this.factoryEntriesMap === undefined) {
            throw new Error("Shared objects were not provided during creation.");
        }

        for (const key of this.factoryEntriesMap.keys()) {
            if (key === id) {
                const handle = this.root.get<IFluidHandle>(id);
                return handle?.get() as unknown as T;
            }
        }

        throw new Error(`Shared object with id ${id} not found.`);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return defaultFluidObjectRequestHandler(this, request);
    }

    private async initialize(existing: boolean) {
        if (!existing) {
            this.root = SharedMap.create(this.runtime, "root");

            this.factoryEntriesMap.forEach((sharedObjectFactory: IChannelFactory, key: string) => {
                const sharedObject = this.runtime.createChannel(key, sharedObjectFactory.type);
                this.root.set(key, sharedObject.handle);
            });

            this.root.bindToContext();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
    }
}

export type ChannelFactoryRegistry = Iterable<[string | undefined, IChannelFactory]>;

/**
 * Creates a factory for a TestFluidObject with the given object factory entries. It creates a data store runtime
 * with the object factories in the entry list. All the entries with an id other than undefined are passed to the
 * Fluid object so that it can create a shared object for each.
 *
 * @example
 * The following will create a Fluid object that creates and loads a SharedString and SharedDirectory.
 * It will add SparseMatrix to the data store's factory so that it can be created later.
 *
 * ```typescript
 * new TestFluidObjectFactory([
 *  [ "sharedString", SharedString.getFactory() ],
 *  [ "sharedDirectory", SharedDirectory.getFactory() ],
 *  [ undefined, SparseMatrix.getFactory() ],
 * ]);
 * ```
 *
 * The SharedString and SharedDirectory can be retrieved via getSharedObject() on the TestFluidObject as follows:
 *
 * ```typescript
 * sharedString = testFluidObject.getSharedObject<SharedString>("sharedString");
 * sharedDir = testFluidObject.getSharedObject<SharedDirectory>("sharedDirectory");
 * ```
 */
export class TestFluidObjectFactory implements IFluidDataStoreFactory {
    public get IFluidDataStoreFactory() { return this; }

    /**
     * Creates a new TestFluidObjectFactory.
     * @param factoryEntries - A list of id to IChannelFactory mapping. It creates a data store runtime with each
     * IChannelFactory. Entries with string ids are passed to the Fluid object so that it can create a shared object
     * for it.
     */
    constructor(private readonly factoryEntries: ChannelFactoryRegistry,
        public readonly type = "TestFluidObjectFactory") { }

    public async instantiateDataStore(
        context: IFluidDataStoreContext,
        existing: boolean,
    ): Promise<FluidDataStoreRuntime> {
        const dataTypes = new Map<string, IChannelFactory>();

        // Add SharedMap's factory which will be used to create the root map.
        const sharedMapFactory = SharedMap.getFactory();
        dataTypes.set(sharedMapFactory.type, sharedMapFactory);

        // Add the object factories to the list to be sent to data store runtime.
        for (const entry of this.factoryEntries) {
            const factory = entry[1];
            dataTypes.set(factory.type, factory);
        }

        // Create a map from the factory entries with entries that don't have the id as undefined. This will be
        // passed to the Fluid object.
        const factoryEntriesMapForObject = new Map<string, IChannelFactory>();
        for (const entry of this.factoryEntries) {
            const id = entry[0];
            if (id !== undefined) {
                factoryEntriesMapForObject.set(id, entry[1]);
            }
        }

        const runtimeClass = mixinRequestHandler(
            async (request: IRequest) => {
                const router = await routerP;
                return router.request(request);
            });

        const runtime = new runtimeClass(context, dataTypes, existing);
        const routerP = TestFluidObject.load(
            runtime,
            runtime,
            context,
            factoryEntriesMapForObject,
            existing,
        );

        return runtime;
    }
}
