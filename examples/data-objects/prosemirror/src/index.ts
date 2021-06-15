/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
    IStatelessContainerContext,
} from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidDataStoreFactory, FlushMode } from "@fluidframework/runtime-definitions";
import {
    innerRequestHandler,
    buildRuntimeRequestHandler,
    rootDataStoreRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { fluidExport as smde } from "./prosemirror";

const defaultComponent = smde.type;
const defaultComponentId = "default";

class ProseMirrorFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
            [defaultComponent, Promise.resolve(smde)],
        ]);

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(defaultComponentId),
                innerRequestHandler,
            ));

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing) {
            await runtime.createRootDataStore(defaultComponent, defaultComponentId);
        }

        return runtime;
    }

    public async instantiateFirstTime(context: IStatelessContainerContext): Promise<IRuntime> {
        const runtime = await this.loadRuntime(context);
        await runtime.createRootDataStore(defaultComponent, defaultComponentId);
        return runtime;
    }

    public async instantiateFromExisting(context: IStatelessContainerContext): Promise<IRuntime> {
        const runtime = await this.loadRuntime(context);
        return runtime;
    }

    private async loadRuntime(context: any) {
        const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
            [defaultComponent, Promise.resolve(smde)],
        ]);

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(defaultComponentId),
                rootDataStoreRequestHandler,
            ));

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);
        return runtime;
    }
}

export const fluidExport = new ProseMirrorFactory();

export const instantiateRuntime =
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (context: IContainerContext): Promise<IRuntime> => fluidExport.instantiateRuntime(context);
export const instantiateFirstTime =
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (context: IStatelessContainerContext): Promise<IRuntime> => fluidExport.instantiateFirstTime(context);
export const instantiateFromExisting =
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    (context: IStatelessContainerContext): Promise<IRuntime> => fluidExport.instantiateFromExisting(context);
