/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
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
    innerRequestHandler,
} from "@fluidframework/request-handler";
import {
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";

/**
 * BaseContainerRuntimeFactory produces container runtimes with a given data store and service registry, as well as
 * given request handlers.  It can be subclassed to implement a first-time initialization procedure for the containers
 * it creates.
 */
export class BaseContainerRuntimeFactory implements
    IProvideFluidDataStoreRegistry,
    IRuntimeFactory {
    public get IFluidDataStoreRegistry() { return this.registry; }
    public get IRuntimeFactory() { return this; }
    private readonly registry: IFluidDataStoreRegistry;

    /**
     * @param registryEntries - The data store registry for containers produced
     * @param serviceRegistry - The service registry for containers produced
     * @param requestHandlers - Request handlers for containers produced
     * @param runtimeOptions - The runtime options passed to the ContainerRuntime when instantiating it
     */
    constructor(
        private readonly registryEntries: NamedFluidDataStoreRegistryEntries,
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
        private readonly runtimeOptions?: IContainerRuntimeOptions,
    ) {
        this.registry = new FluidDataStoreRegistry(registryEntries);
    }

    /**
     * {@inheritDoc @fluidframework/container-definitions#IRuntimeFactory.instantiateRuntime}
     */
    public async instantiateRuntime(
        context: IContainerContext,
    ): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            this.registryEntries,
            buildRuntimeRequestHandler(
                ...this.requestHandlers,
                innerRequestHandler),
            this.runtimeOptions,
            context.scope);

        if (!runtime.existing) {
            // If it's the first time through.
            await this.containerInitializingFirstTime(runtime);
        }

        // This always gets called at the end of initialize on first time or from existing.
        await this.containerHasInitialized(runtime);

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
