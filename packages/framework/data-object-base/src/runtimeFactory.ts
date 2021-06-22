/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerContext,
    IRuntime,
} from "@fluidframework/container-definitions";
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
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

const defaultStoreId = "" as const;

export class RuntimeFactory implements RuntimeFactoryHelper {
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

    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await runtime.createRootDataStore(this.defaultStoreFactory.type, defaultStoreId);
    }

    public async preInitialize(context: IContainerContext, existing: boolean): Promise<IRuntime> {
        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            this.registry,
            existing,
            buildRuntimeRequestHandler(
                ...this.requestHandlers,
                innerRequestHandler),
        );

        // Flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);
        return runtime;
    }
}
