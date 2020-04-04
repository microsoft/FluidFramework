/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse, IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { SharedMap, ISharedMap } from "@microsoft/fluid-map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { ITestFluidComponent } from "./interfaces";

/**
 * A test component that will create a shared object for each `id` and `ISharedObjectFactory` pair passed to load.
 * The SharedObjects can be retrieved by passing the `id` to getSharedObject.
 * It exposes the IComponentContext and IComponentRuntime.
 */
export class TestFluidComponent implements ITestFluidComponent {
    public static async load(
        runtime: IComponentRuntime,
        context: IComponentContext,
        factoryEntries: Iterable<[string, ISharedObjectFactory]>) {

        const component = new TestFluidComponent(runtime, context, factoryEntries);
        await component.initialize();

        return component;
    }

    public get ITestFluidComponent() {
        return this;
    }

    private root!: ISharedMap;
    private readonly factoryEntriesMap: Map<string, ISharedObjectFactory>;

    /**
     * Creates a new TestFluidComponent.
     * @param runtime - The component runtime.
     * @param context - The componet context.
     * @param factoryEntries - A list of id to ISharedObjectFactory mapping. For each item in the list,
     * a shared object is created which can be retrieved by calling getSharedObject() with the id;
     */
    constructor(
        public readonly runtime: IComponentRuntime,
        public readonly context: IComponentContext,
        factoryEntries: Iterable<[string, ISharedObjectFactory]>,
    ) {
        this.factoryEntriesMap = new Map(factoryEntries);
    }

    /**
     * Retrieves a shared object with the given id.
     * @param id The id of the shared object to retrieve.
     */
    public async getSharedObject<T = any>(id: string): Promise<T> {
        if (this.factoryEntriesMap === undefined) {
            throw new Error("Shared objects were not provided during creation.");
        }

        for (const key of this.factoryEntriesMap.keys()) {
            if (key === id) {
                const handle = this.root.get<IComponentHandle>(id);
                return handle?.get() as unknown as T;
            }
        }

        throw new Error(`Shared object with id ${id} not found.`);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");

            this.factoryEntriesMap.forEach((sharedObjectFactory: ISharedObjectFactory, key: string) => {
                const sharedObject = this.runtime.createChannel(key, sharedObjectFactory.type);
                this.root.set(key, sharedObject.handle);
            });

            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
    }
}

/**
 * Creates a factory for a TestFluidComponent with the given object factories. The component will create
 * an object for each object factory.
 *
 * For example, to create a component with SharedString and SharedDirectory, create the factory as follows:
 *      new TestFluidComponentFactory([
 *          [ "sharedString", SharedString.getFactory() ],
 *          [ "sharedDirectory", SharedDirectory.getFactory() ],
 *      ]);
 *
 * The objects can then be retrieved via getSharedObject() on the TestFluidComponent as follows:
 *      sharedString = testFluidComponent.getSharedObject<SharedString>("sharedString");
 *      sharedDir = testFluidComponent.getSharedObject<SharedDirectory>("sharedDirectory");
 */
export class TestFluidComponentFactory implements IComponentFactory {
    public static readonly type = "TestFluidComponentFactory";
    public readonly type = TestFluidComponentFactory.type;

    public get IComponentFactory() { return this; }

    /**
     * Creates a new TestFluidComponentFactory.
     * @param factoryEntries - A list of id to ISharedObjectFactory mapping.
     */
    constructor(private readonly factoryEntries: Iterable<[string, ISharedObjectFactory]>) {}

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();

        // Add SharedMap's factory which will be used to create the root map.
        const sharedMapFactory = SharedMap.getFactory();
        dataTypes.set(sharedMapFactory.type, sharedMapFactory);

        // Add the object factories to the list to be sent to component runtime.
        for (const entry of this.factoryEntries) {
            const factory = entry[1];
            dataTypes.set(factory.type, factory);
        }

        const runtime = ComponentRuntime.load(
            context,
            dataTypes,
        );

        const testFluidComponentP = TestFluidComponent.load(runtime, context, this.factoryEntries);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const testFluidComponent = await testFluidComponentP;
            return testFluidComponent.request(request);
        });
    }
}
