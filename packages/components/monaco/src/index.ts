/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRuntime } from "@prague/component-runtime";
import { IRequest } from "@prague/container-definitions";
import {
    CounterValueType,
    DistributedSetValueType,
    registerDefaultValueType,
    SharedMap,
} from "@prague/map";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import { MonacoRunner } from "./chaincode";

/**
 * Instantiates a new ComponentRuntime and loads a new MonacoRunner in it.  Returns
 * the runtime.
 * @param context The ComponentContext to associate with the ComponentRuntime
 */
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const modules = new Map<string, any>();

    // Register default map value types
    registerDefaultValueType(new DistributedSetValueType());
    registerDefaultValueType(new CounterValueType());
    registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
    registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

    // Create channel extensions
    const mapExtension = SharedMap.getFactory();
    const sharedStringExtension = sequence.SharedString.getFactory();
    const objectSequenceExtension = sequence.SharedObjectSequence.getFactory();
    const numberSequenceExtension = sequence.SharedNumberSequence.getFactory();

    modules.set(mapExtension.type, mapExtension);
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
