/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
    IResponse,
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    CounterValueType,
    DistributedSetValueType,
    SharedMap,
} from "@prague/map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectFactory } from "@prague/shared-object-common";
import { EventEmitter } from "events";
import { ProgressCollection } from "./progressBars";

export class CollectionManager extends EventEmitter {
    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new CollectionManager(runtime, context);
        await collection.initialize();

        return collection;
    }

    public id: string;
    private progressCollection: ProgressCollection;

    constructor(private runtime: IComponentRuntime, private context: IComponentContext) {
        super();

        this.id = runtime.id;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "factories":
                return ["progress"];
            case "progress":
                return this.progressCollection;
            default:
                return null;
        }
    }

    public detach() {
        return;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            const progressItemRuntime = await this.context.createComponent(
                "progress",
                `@component/collection-components/lib/progress`);
            progressItemRuntime.attach();
        }

        const runtime = await this.context.getComponentRuntime("progress", true);
        const progressResponse = await runtime.request({ url: "/" });
        this.progressCollection = progressResponse.value as ProgressCollection;
    }
}

export function instantiateComponent(context: IComponentContext): void {
    // Map value types to register as defaults
    const mapValueTypes = [
        new DistributedSetValueType(),
        new CounterValueType(),
    ];

    const dataTypes = new Map<string, ISharedObjectFactory>();
    const mapFactory = SharedMap.getFactory(mapValueTypes);

    dataTypes.set(mapFactory.type, mapFactory);

    ComponentRuntime.load(
        context,
        dataTypes,
        (runtime) => {
            const progressCollectionP = CollectionManager.load(runtime, context);
            runtime.registerRequestHandler(async (request: IRequest) => {
                const progressCollection = await progressCollectionP;
                return progressCollection.request(request);
            });
        });
}
