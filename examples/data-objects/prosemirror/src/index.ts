/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidDataStoreFactory, FlushMode } from "@fluidframework/runtime-definitions";
import {
    deprecated_innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { fluidExport as smde } from "./prosemirror";

const defaultComponent = smde.type;

class ProseMirrorFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
            [defaultComponent, Promise.resolve(smde)],
        ]);

        const defaultComponentId = "default";

        const runtime = await ContainerRuntime._load(
            context,
            registry,
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(defaultComponentId),
                deprecated_innerRequestHandler,
            ),
            { generateSummaries: true });

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing) {
            await runtime.createRootDataStore(defaultComponent, defaultComponentId);
        }

        return runtime;
    }
}

export const fluidExport = new ProseMirrorFactory();

// eslint-disable-next-line @typescript-eslint/promise-function-async, prefer-arrow/prefer-arrow-functions
export function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return fluidExport.instantiateRuntime(context);
}
