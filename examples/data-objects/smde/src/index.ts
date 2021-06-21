/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
import { fluidExport as smde } from "./smde";

const defaultComponentId = "default";
const defaultComponent = "@fluid-example/smde";

class SmdeContainerFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    /**
     * @deprecated Use instantiateFirstTime/instantiateFromExisting as appropriate
     */
    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        if (context.existing === true) {
            return this.instantiateFromExisting(context);
        }

        return this.instantiateFirstTime(context);
    }

    public async instantiateFirstTime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await this.loadRuntime(context, false);
        await runtime.createRootDataStore(defaultComponent, defaultComponentId);
        return runtime;
    }

    public async instantiateFromExisting(context: IContainerContext): Promise<IRuntime> {
        const runtime = await this.loadRuntime(context, true);
        return runtime;
    }

    private async loadRuntime(context: IContainerContext, existing: boolean): Promise<ContainerRuntime> {
        const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
            ["@fluid-example/smde", Promise.resolve(smde)],
        ]);
        const runtime: ContainerRuntime = await ContainerRuntime.load(
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

export const fluidExport = new SmdeContainerFactory();
