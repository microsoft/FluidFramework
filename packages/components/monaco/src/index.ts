/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentRuntime } from "@prague/component-runtime";
import { IRequest } from "@prague/container-definitions";
import {
    CounterValueType,
    DistributedSetValueType,
    SharedMap,
} from "@prague/map";
import { IComponentContext } from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import { MonacoRunner } from "./chaincode";

/**
 * Instantiates a new ComponentRuntime and loads a new MonacoRunner in it.  Returns
 * the runtime.
 * @param context The ComponentContext to associate with the ComponentRuntime
 */
export function instantiateComponent(context: IComponentContext): void {
    const modules = new Map<string, any>();

    // Map value types to register as defaults
    const mapValueTypes = [
        new DistributedSetValueType(),
        new CounterValueType(),
        new sequence.SharedStringIntervalCollectionValueType(),
        new sequence.SharedIntervalCollectionValueType(),
    ];

    // Create channel extensions
    const mapExtension = SharedMap.getFactory(mapValueTypes);
    const sharedStringExtension = sequence.SharedString.getFactory();
    const objectSequenceExtension = sequence.SharedObjectSequence.getFactory();
    const numberSequenceExtension = sequence.SharedNumberSequence.getFactory();

    modules.set(mapExtension.type, mapExtension);
    modules.set(sharedStringExtension.type, sharedStringExtension);
    modules.set(objectSequenceExtension.type, objectSequenceExtension);
    modules.set(numberSequenceExtension.type, numberSequenceExtension);

    ComponentRuntime.load(
        context,
        modules,
        (runtime) => {
            const runnerP = MonacoRunner.load(runtime, context);

            runtime.registerRequestHandler(async (request: IRequest) => {
                const runner = await runnerP;
                return request.url && request.url !== "/"
                    ? { status: 404, mimeType: "text/plain", value: `${request.url} not found` }
                    : { status: 200, mimeType: "prague/component", value: runner };
            });
        });
}
