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
import { FlushMode } from "@fluidframework/runtime-definitions";
import {
    innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { createDataStoreRegistry } from "@fluidframework/runtime-utils";
import { fluidExport as smde } from "./smde";

class SmdeContainerFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const defaultComponentId = "default";
        const defaultComponent = "@fluid-example/smde";

        const runtime = await ContainerRuntime.load(
            context,
            createDataStoreRegistry([
                ["@fluid-example/smde", Promise.resolve(smde)],
            ]),
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(defaultComponentId),
                innerRequestHandler,
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

export const fluidExport = new SmdeContainerFactory();

export const instantiateRuntime =
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (context: IContainerContext): Promise<IRuntime> =>
        fluidExport.instantiateRuntime(context);
