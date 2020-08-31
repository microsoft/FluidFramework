/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { DependencyContainerRegistry } from "@fluidframework/synthesize";
import {
    RuntimeRequestHandler,
    deprecated_innerRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "../request-handlers";
import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory";

const defaultDataStoreId = "default";

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 */
export class ContainerRuntimeFactoryWithDefaultDataStore extends BaseContainerRuntimeFactory {
    public static readonly defaultDataStoreId = defaultDataStoreId;

    constructor(
        private readonly defaultDataStoreName: string,
        registryEntries: NamedFluidDataStoreRegistryEntries,
        providerEntries: DependencyContainerRegistry = [],
        requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        super(
            registryEntries,
            providerEntries,
            [
                ...requestHandlers,
                defaultRouteRequestHandler(defaultDataStoreId),
                deprecated_innerRequestHandler,
            ],
        );
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const router = await runtime.createRootDataStore(
            this.defaultDataStoreName,
            ContainerRuntimeFactoryWithDefaultDataStore.defaultDataStoreId,
        );
        // We need to request the data store before attaching to ensure it
        // runs through its entire instantiation flow.
        await router.request({ url: "/" });
    }
}
