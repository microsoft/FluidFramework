/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse, IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidObjectHandle, FluidDataStoreRuntime } from "@fluidframework/datastore";
import { SharedMap, ISharedMap } from "@fluidframework/map";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ITestFluidComponent } from "./interfaces";

/**
 * A test component that will create a shared object for each key-value pair in the factoryEntries passed to load.
 * The shared objects can be retrieved by passing the key of the entry to getSharedObject.
 * It exposes the IFluidDataStoreContext and IFluidDataStoreRuntime.
 */
export class TestFluidComponent implements ITestFluidComponent {
    public static async load(
        runtime: IFluidDataStoreRuntime,
        channel: IFluidDataStoreChannel,
        context: IFluidDataStoreContext,
        factoryEntries: Map<string, IChannelFactory>) {
        const component = new TestFluidComponent(runtime, channel, context, factoryEntries);
        await component.initialize();

        return component;
    }

    public get ITestFluidComponent() {
        return this;
    }

    public get IFluidLoadable() {
        return this;
    }

    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    public url: string;
    public root!: ISharedMap;
    private readonly innerHandle: IFluidHandle<this>;

    /**
     * Creates a new TestFluidComponent.
     * @param runtime - The data store runtime.
     * @param context - The componet context.
     * @param factoryEntries - A list of id to IChannelFactory mapping. For each item in the list,
     * a shared object is created which can be retrieved by calling getSharedObject() with the id;
     */
    constructor(
        public readonly runtime: IFluidDataStoreRuntime,
        public readonly channel: IFluidDataStoreChannel,
        public readonly context: IFluidDataStoreContext,
        private readonly factoryEntriesMap: Map<string, IChannelFactory>,
    ) {
        this.url = context.id;
        this.innerHandle = new FluidObjectHandle(this, "", runtime.IFluidHandleContext);
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
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        // Don't initialize if existing on storage or loaded detached from snapshot(ex. draft mode).
        if (!this.runtime.existing) {
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
 * Creates a factory for a TestFluidComponent with the given object factory entries. It creates a data store runtime
 * with the object factories in the entry list. All the entries with an id other than undefined are passed to the
 * component so that it can create a shared object for each.
 *
 * For example, the following will create a component that creates and loads a SharedString and SharedDirectory. It
 * will add SparseMatrix to the data store runtime's factory so that it can be created later.
 *      new TestFluidComponentFactory([
 *          [ "sharedString", SharedString.getFactory() ],
 *          [ "sharedDirectory", SharedDirectory.getFactory() ],
*          [ undefined, SparseMatrix.getFactory() ],
 *      ]);
 *
 * The SharedString and SharedDirectory can be retrieved via getSharedObject() on the TestFluidComponent as follows:
 *      sharedString = testFluidComponent.getSharedObject<SharedString>("sharedString");
 *      sharedDir = testFluidComponent.getSharedObject<SharedDirectory>("sharedDirectory");
 */
export class TestFluidComponentFactory implements IFluidDataStoreFactory {
    public static readonly type = "TestFluidComponentFactory";
    public readonly type = TestFluidComponentFactory.type;

    public get IFluidDataStoreFactory() { return this; }

    /**
     * Creates a new TestFluidComponentFactory.
     * @param factoryEntries - A list of id to IChannelFactory mapping. It creates a data store runtime with each
     * IChannelFactory. Entries with string ids are passed to the component so that it can create a shared object
     * for it.
     */
    constructor(private readonly factoryEntries: ChannelFactoryRegistry) { }

    public instantiateDataStore(context: IFluidDataStoreContext): void {
        const dataTypes = new Map<string, IChannelFactory>();

        // Add SharedMap's factory which will be used to create the root map.
        const sharedMapFactory = SharedMap.getFactory();
        dataTypes.set(sharedMapFactory.type, sharedMapFactory);

        // Add the object factories to the list to be sent to data store runtime.
        for (const entry of this.factoryEntries) {
            const factory = entry[1];
            dataTypes.set(factory.type, factory);
        }

        const runtime = FluidDataStoreRuntime.load(
            context,
            dataTypes,
        );

        // Create a map from the factory entries with entries that don't have the id as undefined. This will be
        // passed to the component.
        const factoryEntriesMapForComponent = new Map<string, IChannelFactory>();
        for (const entry of this.factoryEntries) {
            const id = entry[0];
            if (id !== undefined) {
                factoryEntriesMapForComponent.set(id, entry[1]);
            }
        }

        const testFluidComponentP = TestFluidComponent.load(runtime, runtime, context, factoryEntriesMapForComponent);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const testFluidComponent = await testFluidComponentP;
            return testFluidComponent.request(request);
        });
    }
}
