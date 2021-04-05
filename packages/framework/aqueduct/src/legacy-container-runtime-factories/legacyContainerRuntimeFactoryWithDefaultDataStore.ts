/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidDataStoreFactory, NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { DependencyContainerRegistry } from "@fluidframework/synthesize";
import {
    RuntimeRequestHandler,
    innerRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "../request-handlers";
import { LegacyBaseContainerRuntimeFactory } from "./legacyBaseContainerRuntimeFactory";

const defaultDataStoreId = "default";

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 * @deprecated Only use if your scenario requires backwards compatibility with documents that were produced before
 * AgentScheduler was removed from ContainerRuntime.
 */
export class LegacyContainerRuntimeFactoryWithDefaultDataStore extends LegacyBaseContainerRuntimeFactory {
    public static readonly defaultDataStoreId = defaultDataStoreId;

    constructor(
        protected readonly defaultFactory: IFluidDataStoreFactory,
        registryEntries: NamedFluidDataStoreRegistryEntries,
        providerEntries: DependencyContainerRegistry = [],
        requestHandlers: RuntimeRequestHandler[] = [],
        runtimeOptions?: IContainerRuntimeOptions,
    ) {
        super(
            registryEntries,
            providerEntries,
            [
                ...requestHandlers,
                defaultRouteRequestHandler(defaultDataStoreId),
                innerRequestHandler,
            ],
            runtimeOptions,
        );
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        await runtime.createRootDataStore(
            this.defaultFactory.type,
            defaultDataStoreId,
        );
    }
}
