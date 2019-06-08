import { ComponentRuntime } from "@prague/component-runtime";
import {
    IRequest,
    IResponse,
} from "@prague/container-definitions";
import {
    CounterValueType,
    DistributedSetValueType,
    MapExtension,
    registerDefaultValueType,
} from "@prague/map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { EventEmitter } from "events";
import { ProgressCollection } from "./progressBars";

export class CollectionManager extends EventEmitter {
    public static async Load(runtime: IComponentRuntime, context: IComponentContext) {
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
            await this.context.createAndAttachComponent(
                "progress",
                `@component/collection-components/lib/progress`);
        }

        const runtime = await this.context.getComponentRuntime("progress", true);
        const progressResponse = await runtime.request({ url: "/" });
        this.progressCollection = progressResponse.value as ProgressCollection;
    }
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Register default map value types
    registerDefaultValueType(new DistributedSetValueType());
    registerDefaultValueType(new CounterValueType());

    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(MapExtension.Type, new MapExtension());

    const runtime = await ComponentRuntime.Load(context, dataTypes);
    const progressCollectionP = CollectionManager.Load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const progressCollection = await progressCollectionP;
        return progressCollection.request(request);
    });

    return runtime;
}
