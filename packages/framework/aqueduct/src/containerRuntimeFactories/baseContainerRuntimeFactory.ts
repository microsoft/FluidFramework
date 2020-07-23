/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
import {
    ComponentRegistry,
    ContainerRuntime,
} from "@fluidframework/container-runtime";
import {
    IContainerRuntime,
} from "@fluidframework/container-runtime-definitions";
import {
    RuntimeRequestHandler, RuntimeRequestHandlerBuilder, componentRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import {
    IComponentRegistry,
    IProvideComponentRegistry,
    NamedComponentRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { DependencyContainer, DependencyContainerRegistry } from "@fluidframework/synthesize";

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
     * {@inheritDoc @fluidframework/container-definitions#IRuntimeFactory.instantiateRuntime}
     */
    public async instantiateRuntime(
        context: IContainerContext,
    ): Promise<IRuntime> {
        const parentDependencyContainer = context.scope.IComponentDependencySynthesizer;
        const dc = new DependencyContainer(parentDependencyContainer);
        for (const entry of Array.from(this.providerEntries)) {
            dc.register(entry.type, entry.provider);
        }

        // Create a scope object that passes through everything except for IComponentDependencySynthesizer
        // which we will replace with the new one we just created.
        const scope: any = context.scope;
        scope.IComponentDependencySynthesizer = dc;

        const builder = new RuntimeRequestHandlerBuilder();
        builder.pushHandler(...this.requestHandlers);
        builder.pushHandler(componentRuntimeRequestHandler);

        const runtime = await ContainerRuntime.load(
            context,
            this.registryEntries,
            async (req,rt) => builder.handleRequest(req, rt),
            undefined,
            scope);

        // we register the runtime so developers of providers can use it in the factory pattern.
        dc.register(IContainerRuntime, runtime);

        if (!runtime.existing) {
            // If it's the first time through.
            await this.containerInitializingFirstTime(runtime, context);
        }

        // This always gets called at the end of initialize on first time or from existing.
        await this.containerHasInitialized(runtime, context);

        return runtime;
    }

    /**
     * Subclasses may override containerInitializingFirstTime to perform any setup steps at the time the container
     * is created. This likely includes creating any initial components that are expected to be there at the outset.
     * @param runtime - The container runtime for the container being initialized
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime, context: IContainerContext) { }

    /**
     * Subclasses may override containerHasInitialized to perform any steps after the container has initialized.
     * This likely includes loading any components that are expected to be there at the outset.
     * @param runtime - The container runtime for the container being initialized
     */
    protected async containerHasInitialized(runtime: IContainerRuntime, context: IContainerContext) { }
}
