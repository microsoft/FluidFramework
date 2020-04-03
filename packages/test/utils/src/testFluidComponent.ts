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

export type TestComponentSharedObjectsMap = Map<string, ISharedObjectFactory>;

export class TestFluidComponent implements ITestFluidComponent {
    public static async load(
        runtime: IComponentRuntime,
        context: IComponentContext,
        sharedObjects?: TestComponentSharedObjectsMap) {

        const component = new TestFluidComponent(runtime, context, sharedObjects);
        await component.initialize();

        return component;
    }

    public get ITestFluidComponent() {
        return this;
    }

    private root!: ISharedMap;

    constructor(
        public readonly runtime: IComponentRuntime,
        public readonly context: IComponentContext,
        private readonly sharedObjects?: TestComponentSharedObjectsMap,
    ) {}

    public async getSharedObject<T = any>(id: string): Promise<T> {
        if (this.sharedObjects === undefined) {
            throw new Error("Shared objects were not provided during creation.");
        }

        for (const key of this.sharedObjects.keys()) {
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
            this.sharedObjects?.forEach((sharedObjectFactory: ISharedObjectFactory, key: string) => {
                const sharedObject = this.runtime.createChannel(key, sharedObjectFactory.type);
                this.root.set(key, sharedObject.handle);
            });
            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
    }
}

export class TestFluidComponentFactory implements IComponentFactory {
    public static readonly type = "TestFluidComponentFactory";
    public readonly type = TestFluidComponentFactory.type;

    public get IComponentFactory() { return this; }

    constructor(private readonly sharedObjects?: TestComponentSharedObjectsMap) {}

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();

        // Add SharedMapFactory which will be the root for the component.
        const sharedMapFactory = SharedMap.getFactory();
        dataTypes.set(sharedMapFactory.type, sharedMapFactory);

        // Add the object factories to the list to be sent to component runtime.
        this.sharedObjects?.forEach((objectFactory: ISharedObjectFactory) => {
            dataTypes.set(objectFactory.type, objectFactory);
        });

        const runtime = ComponentRuntime.load(
            context,
            dataTypes,
        );

        const testFluidComponentP = TestFluidComponent.load(runtime, context, this.sharedObjects);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const testFluidComponent = await testFluidComponentP;
            return testFluidComponent.request(request);
        });
    }
}
