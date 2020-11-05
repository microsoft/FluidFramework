/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidDataStoreFactory, NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import { RootDataObjectFactory } from "../data-object-factories";
import { defaultRouteRequestHandler } from "../request-handlers";
import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory";

const defaultDataStoreId = "default";

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 */
export class ContainerRuntimeFactoryWithDefaultDataStore
        extends BaseContainerRuntimeFactory {
    public static readonly defaultDataStoreId = defaultDataStoreId;

    constructor(
        protected readonly defaultFactory: IFluidDataStoreFactory | RootDataObjectFactory,
        registryEntries: NamedFluidDataStoreRegistryEntries,
        requestHandlers: RuntimeRequestHandler[] = [],
        runtimeOptions?: IContainerRuntimeOptions,
    ) {
        super(
            registryEntries,
            [
                ...requestHandlers,
                defaultRouteRequestHandler(defaultDataStoreId),
            ],
            runtimeOptions,
        );
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        if ("createRootInstance" in this.defaultFactory) {
            await this.defaultFactory.createRootInstance(
                defaultDataStoreId,
                runtime,
                runtime.scope.IFluidDependencyProvider);
        } else {
            await runtime.createRootDataStore(
                this.defaultFactory.type,
                defaultDataStoreId,
            );
        }
    }
}
