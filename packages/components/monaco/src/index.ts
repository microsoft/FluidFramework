import { ComponentRuntime } from "@prague/component-runtime";
import { IRequest } from "@prague/container-definitions";
import {
    CounterValueType,
    DistributedSetValueType,
    MapExtension,
    registerDefaultValueType,
} from "@prague/map";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import { MonacoRunner } from "./chaincode";

/**
 * Instantiates a new chaincode component
 */
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const modules = new Map<string, any>();

    // Register default map value types
    registerDefaultValueType(new DistributedSetValueType());
    registerDefaultValueType(new CounterValueType());
    registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
    registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

    // Create channel extensions
    const mapExtension = new MapExtension();
    const sharedStringExtension = new sequence.SharedStringExtension();
    const objectSequenceExtension = new sequence.SharedObjectSequenceExtension();
    const numberSequenceExtension = new sequence.SharedNumberSequenceExtension();

    modules.set(MapExtension.Type, mapExtension);
    modules.set(sharedStringExtension.type, sharedStringExtension);
    modules.set(objectSequenceExtension.type, objectSequenceExtension);
    modules.set(numberSequenceExtension.type, numberSequenceExtension);

    const runtime = await ComponentRuntime.load(context, modules);
    const runnerP = MonacoRunner.load(runtime, context);

    runtime.registerRequestHandler(async (request: IRequest) => {
        const runner = await runnerP;
        return request.url && request.url !== "/"
            ? { status: 404, mimeType: "text/plain", value: `${request.url} not found` }
            : { status: 200, mimeType: "prague/component", value: runner };
    });

    return runtime;
}
