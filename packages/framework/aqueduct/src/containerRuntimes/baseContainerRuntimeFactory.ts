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
    IHostRuntime,
    IProvideComponentRegistry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import {
    generateContainerServicesRequestHandler,
    ContainerServiceRegistryEntries,
} from "../containerServices";

export class BaseContainerRuntimeFactory implements
    IProvideComponentRegistry,
    IRuntimeFactory {
    public get IComponentRegistry() { return this.registry; }
    public get IRuntimeFactory() { return this; }
    private readonly registry: IComponentRegistry;

    constructor(
        private readonly registryEntries: NamedComponentRegistryEntries,
        private readonly serviceRegistry: ContainerServiceRegistryEntries = [],
        private readonly requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        this.registry = new ComponentRegistry(registryEntries);
    }

    /**
     * Helper function to instantiate a new default runtime
     */
    public async instantiateRuntime(
        context: IContainerContext,
    ): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            this.registryEntries,
            [
                generateContainerServicesRequestHandler(this.serviceRegistry),
                ...this.requestHandlers,
                componentRuntimeRequestHandler,
            ]);

        // On first boot create the base component
        if (!runtime.existing) {
            try {
                await this.containerInitializingFirstTime(runtime);
            } catch (error) {
                runtime.error(error);
                throw error;
            }
        }

        return runtime;
    }

    protected async containerInitializingFirstTime(runtime: IHostRuntime) { }
}
