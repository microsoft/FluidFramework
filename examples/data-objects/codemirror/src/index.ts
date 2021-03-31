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
    innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";

import { fluidExport as smde } from "./codemirror";

class CodeMirrorFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
            ["@fluid-example/smde", Promise.resolve(smde)],
        ]);

        const defaultComponentId = "default";
        const defaultComponent = "@fluid-example/smde";

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(defaultComponentId),
                innerRequestHandler));

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing) {
            await runtime.createRootDataStore(defaultComponent, defaultComponentId);
        }

        return runtime;
    }
}

export const fluidExport = new CodeMirrorFactory();

export const instantiateRuntime =
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (context: IContainerContext): Promise<IRuntime> => fluidExport.instantiateRuntime(context);
