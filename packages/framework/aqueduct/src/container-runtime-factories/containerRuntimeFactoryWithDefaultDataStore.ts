/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidDataStoreFactory, NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { DependencyContainerRegistry } from "@fluidframework/synthesize";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import { RootDataObjectFactory } from "../data-object-factories";
import { defaultRouteRequestHandler } from "../request-handlers";
import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory";

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 */
export class ContainerRuntimeFactoryWithDefaultDataStore<T extends IFluidDataStoreFactory>
        extends BaseContainerRuntimeFactory {
    constructor(
        protected readonly defaultFactory: T,
        registryEntries: NamedFluidDataStoreRegistryEntries,
        providerEntries: DependencyContainerRegistry = [],
        requestHandlers: RuntimeRequestHandler[] = [],
        runtimeOptions?: IContainerRuntimeOptions,
    ) {
        super(
            registryEntries,
            [
                ...requestHandlers,
                defaultRouteRequestHandler(defaultFactory.type),
            ],
            runtimeOptions,
            providerEntries,
        );
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        await runtime.createRootDataStore(
            this.defaultFactory.type, // pkg
            this.defaultFactory.type, // id
        );
    }
}

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 */
export class ContainerRuntimeFactoryWithScope
        extends ContainerRuntimeFactoryWithDefaultDataStore<RootDataObjectFactory> {
    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        await this.defaultFactory.createRootInstance(runtime, runtime.scope.IFluidDependencyProvider);
    }
}
