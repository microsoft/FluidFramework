/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import {
    componentRuntimeRequestHandler,
    ComponentRegistry,
    ContainerRuntime,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import {
    IComponentRegistry,
    IContainerRuntime,
    IProvideComponentRegistry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { DependencyContainer, DependencyContainerRegistry } from "@microsoft/fluid-synthesize";

/**
 * BaseContainerRuntimeFactory produces container runtimes with a given component and service registry, as well as
 * given request handlers.  It can be subclassed to implement a first-time initialization procedure for the containers
 * it creates.
 */
export class BaseContainerRuntimeFactory implements
    IProvideComponentRegistry,
    IRuntimeFactory {
    public get IComponentRegistry() { return this.registry; }
    public get IRuntimeFactory() { return this; }
    private readonly registry: IComponentRegistry;

    /**
     * @param registryEntries - The component registry for containers produced
     * @param serviceRegistry - The service registry for containers produced
     * @param requestHandlers - Request handlers for containers produced
     */
    constructor(
        private readonly registryEntries: NamedComponentRegistryEntries,
        private readonly providerEntries: DependencyContainerRegistry = [],
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        this.registry = new ComponentRegistry(registryEntries);
    }

    /**
     * {@inheritDoc @microsoft/fluid-container-definitions#IRuntimeFactory.instantiateRuntime}
     */
    public async instantiateRuntime(
        context: IContainerContext,
    ): Promise<IRuntime> {
        const parentDependencyContainer = context.scope.IComponentDependencySynthesizer;
        const dc = new DependencyContainer(parentDependencyContainer);
        for (const entry of Array.from(this.providerEntries)) {
            dc.register(entry.type, entry.provider);
        }

        const runtime = await ContainerRuntime.load(
            context,
            this.registryEntries,
            [
                ...this.requestHandlers,
                componentRuntimeRequestHandler,
            ],
            undefined,
            dc);

        // we register the runtime so developers of providers can use it in the factory pattern.
        dc.register(IContainerRuntime, runtime);

        // On first boot create the base component
        if (!runtime.existing) {
            await this.containerInitializingFirstTime(runtime);
        }

        return runtime;
    }

    /**
     * Subclasses may override containerInitializingFirstTime to perform any setup steps at the time the container
     * is created.  This likely includes creating any initial components that are expected to be there at the outset.
     * @param runtime - The container runtime for the container being initialized
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) { }
}
