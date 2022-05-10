/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import {
    IContainerRuntimeOptions,
    FluidDataStoreRegistry,
    ContainerRuntime,
} from "@fluidframework/container-runtime";
import {
    IContainerRuntime,
} from "@fluidframework/container-runtime-definitions";
import {
    RuntimeRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import {
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import {
    DependencyContainer,
    IFluidDependencySynthesizer,
    IProvideFluidDependencySynthesizer,
} from "@fluidframework/synthesize";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { FluidObject } from "@fluidframework/core-interfaces";

/**
 * BaseContainerRuntimeFactory produces container runtimes with a given data store and service registry, as well as
 * given request handlers.  It can be subclassed to implement a first-time initialization procedure for the containers
 * it creates.
 */
export class BaseContainerRuntimeFactory
    extends RuntimeFactoryHelper
    implements IProvideFluidDataStoreRegistry {
    public get IFluidDataStoreRegistry() { return this.registry; }
    private readonly registry: IFluidDataStoreRegistry;

    /**
     * @param registryEntries - The data store registry for containers produced
     * @param serviceRegistry - The service registry for containers produced
     * @param requestHandlers - Request handlers for containers produced
     * @param runtimeOptions - The runtime options passed to the ContainerRuntime when instantiating it
     */
    constructor(
        private readonly registryEntries: NamedFluidDataStoreRegistryEntries,
        private readonly dependencyContainer?: IFluidDependencySynthesizer,
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
        private readonly runtimeOptions?: IContainerRuntimeOptions,
    ) {
        super();
        this.registry = new FluidDataStoreRegistry(registryEntries);
    }

    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await this.containerInitializingFirstTime(runtime);
        await this.containerHasInitialized(runtime);
    }

    public async instantiateFromExisting(runtime: ContainerRuntime): Promise<void> {
        await this.containerHasInitialized(runtime);
    }

    public async preInitialize(
        context: IContainerContext,
        existing: boolean,
    ): Promise<ContainerRuntime> {
        const scope: Partial<IProvideFluidDependencySynthesizer> = context.scope;
        const dc = new DependencyContainer<FluidObject<IContainerRuntime>>(
            this.dependencyContainer, scope.IFluidDependencySynthesizer);
        scope.IFluidDependencySynthesizer = dc;

        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            this.registryEntries,
            buildRuntimeRequestHandler(
                ...this.requestHandlers),
            this.runtimeOptions,
            scope,
            existing,
        );

        // we register the runtime so developers of providers can use it in the factory pattern.
        dc.register(IContainerRuntime, runtime);

        return runtime;
    }

    /**
     * Subclasses may override containerInitializingFirstTime to perform any setup steps at the time the container
     * is created. This likely includes creating any initial data stores that are expected to be there at the outset.
     * @param runtime - The container runtime for the container being initialized
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) { }

    /**
     * Subclasses may override containerHasInitialized to perform any steps after the container has initialized.
     * This likely includes loading any data stores that are expected to be there at the outset.
     * @param runtime - The container runtime for the container being initialized
     */
    protected async containerHasInitialized(runtime: IContainerRuntime) { }
}
