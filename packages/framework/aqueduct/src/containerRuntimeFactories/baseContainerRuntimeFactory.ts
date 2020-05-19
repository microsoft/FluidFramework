/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import {
    componentRuntimeRequestHandler,
    ComponentRegistry,
    ContainerRuntime,
    RequestParser,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import {
    IContainerRuntime,
} from "@microsoft/fluid-container-runtime-definitions";
import {
    IComponentRegistry,
    IProvideComponentRegistry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { DependencyContainer, DependencyContainerRegistry } from "@microsoft/fluid-synthesize";
import { MountableView } from "@microsoft/fluid-view-adapters";

/**
 * A MountableView is only required if the view needs to be rendered by a separate React instance.  Since
 * MountableView internalizes the ReactDOM.render() call, it ensures we will be using the same React instance
 * as was used to create the component.  When the view is bundled together with the app this layer isn't necessary.
 * However, our webpack-component-loader is rendering from a separate bundle.
 */
const mountableViewRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    if (request.headers?.mountableView === true) {
        // Reissue the request without the mountableView header.  We'll repack whatever the response is if we can.
        const headers = { ...request.headers };
        delete headers.mountableView;
        const newRequest = new RequestParser({
            url: request.url,
            headers,
        });
        const response = await runtime.request(newRequest);

        if (response.status === 200 && MountableView.canMount(response.value)) {
            return {
                status: 200,
                mimeType: "fluid/component",
                value: new MountableView(response.value),
            };
        }
    }
};

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
                // The mountable view request handler must go before any other request handlers that we might
                // want to return mountable views, so it can correctly handle the header.
                mountableViewRequestHandler,
                ...this.requestHandlers,
                componentRuntimeRequestHandler,
            ],
            undefined,
            dc);

        // we register the runtime so developers of providers can use it in the factory pattern.
        dc.register(IContainerRuntime, runtime);

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
     * is created. This likely includes creating any initial components that are expected to be there at the outset.
     * @param runtime - The container runtime for the container being initialized
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) { }

    /**
     * Subclasses may override containerHasInitialized to perform any steps after the container has initialized.
     * This likely includes loading any components that are expected to be there at the outset.
     * @param runtime - The container runtime for the container being initialized
     */
    protected async containerHasInitialized(runtime: IContainerRuntime) { }
}
