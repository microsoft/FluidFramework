/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
} from "@fluidframework/container-runtime";
import {
    buildRuntimeRequestHandler,
    RuntimeRequestHandler,
} from "@fluidframework/request-handler";
import {
    NamedFluidDataStoreRegistryEntries,
    IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

const defaultStoreId = "" as const;

export class RuntimeFactory extends RuntimeFactoryHelper {
    private readonly registry: NamedFluidDataStoreRegistryEntries;

    constructor(
        private readonly defaultStoreFactory: IFluidDataStoreFactory,
        storeFactories: IFluidDataStoreFactory[] = [defaultStoreFactory],
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        super();
        this.registry =
            (storeFactories.includes(defaultStoreFactory)
                ? storeFactories
                : storeFactories.concat(defaultStoreFactory)
            ).map(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                (factory) => [factory.type, factory]) as NamedFluidDataStoreRegistryEntries;
    }

    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        const dataStore = await runtime.createDataStore(this.defaultStoreFactory.type);
        await dataStore.trySetAlias(defaultStoreId);
    }

    public async preInitialize(
        context: IContainerContext,
        existing: boolean,
    ): Promise<ContainerRuntime> {
        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            this.registry,
            buildRuntimeRequestHandler(
                ...this.requestHandlers),
            undefined, // runtimeOptions
            undefined, // containerScope
            existing,
        );

        return runtime;
    }
}
