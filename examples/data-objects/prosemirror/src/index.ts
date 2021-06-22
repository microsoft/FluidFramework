/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerContext,
    IRuntime,
} from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidDataStoreFactory, FlushMode } from "@fluidframework/runtime-definitions";
import {
    innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { fluidExport as smde } from "./prosemirror";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

const defaultComponent = smde.type;
const defaultComponentId = "default";

class ProseMirrorFactory implements RuntimeFactoryHelper {
    public get IRuntimeFactory() { return this; }

    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await runtime.createRootDataStore(defaultComponent, defaultComponentId);
    }

    public async preInitialize(context: IContainerContext, existing: boolean): Promise<IRuntime> {
        const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
            [defaultComponent, Promise.resolve(smde)],
        ]);

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            existing,
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(defaultComponentId),
                innerRequestHandler,
            ));

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);
        return runtime;
    }
}

export const fluidExport = new ProseMirrorFactory();
