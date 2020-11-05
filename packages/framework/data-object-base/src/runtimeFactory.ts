/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
} from "@fluidframework/container-runtime";
import {
    buildRuntimeRequestHandler,
    RuntimeRequestHandler,
    innerRequestHandler,
} from "@fluidframework/request-handler";
import {
    NamedFluidDataStoreRegistryEntries,
    IFluidDataStoreFactory,
    FlushMode,
} from "@fluidframework/runtime-definitions";
import { FluidDataStoreRegistry } from "@fluidframework/runtime-utils";

const defaultStoreId = "" as const;

export class RuntimeFactory implements IRuntimeFactory {
    private readonly registry: NamedFluidDataStoreRegistryEntries;

    constructor(
        private readonly defaultStoreFactory: IFluidDataStoreFactory,
        storeFactories: IFluidDataStoreFactory[] = [defaultStoreFactory],
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        this.registry =
            (storeFactories.includes(defaultStoreFactory)
                ? storeFactories
                : storeFactories.concat(defaultStoreFactory)
            ).map(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                (factory) => [factory.type, factory]) as NamedFluidDataStoreRegistryEntries;
    }

    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            new FluidDataStoreRegistry(this.registry),
            buildRuntimeRequestHandler(
                ...this.requestHandlers,
                innerRequestHandler),
        );

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base data store
        if (!runtime.existing && this.defaultStoreFactory.type) {
            await runtime.createRootDataStore(this.defaultStoreFactory.type, defaultStoreId);
        }

        return runtime;
    }
}
