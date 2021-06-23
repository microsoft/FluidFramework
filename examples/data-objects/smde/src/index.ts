/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidDataStoreFactory, FlushMode } from "@fluidframework/runtime-definitions";
import {
    innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { fluidExport as smde } from "./smde";

const defaultComponentId = "default";
const defaultComponent = "@fluid-example/smde";

class SmdeContainerFactory extends RuntimeFactoryHelper {
    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await runtime.createRootDataStore(defaultComponent, defaultComponentId);
    }

    public async preInitialize(context: IContainerContext, existing: boolean): Promise<IRuntime> {
        const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
            ["@fluid-example/smde", Promise.resolve(smde)],
        ]);
        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            registry,
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(defaultComponentId),
                innerRequestHandler,
            ),
            undefined,
            existing,
        );

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);
        return runtime;
    }
}

export const fluidExport = new SmdeContainerFactory();
