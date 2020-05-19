/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    componentRuntimeRequestHandler,
    RequestParser,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import { IComponentDefaultFactoryName } from "@microsoft/fluid-framework-interfaces";
import { NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";
import { IContainerRuntime } from "@microsoft/fluid-container-runtime-definitions";
import { DependencyContainerRegistry } from "@microsoft/fluid-synthesize";
import { MountableView } from "@microsoft/fluid-view-adapters";
import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory";

const defaultComponentId = "default";

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

const defaultComponentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            return componentRuntimeRequestHandler(
                new RequestParser({
                    url: defaultComponentId,
                    headers: request.headers,
                }),
                runtime);
        }
        return undefined;
    };

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default component, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 */
export class ContainerRuntimeFactoryWithDefaultComponent extends BaseContainerRuntimeFactory implements
    IComponentDefaultFactoryName {
    public static readonly defaultComponentId = defaultComponentId;

    constructor(
        private readonly defaultComponentName: string,
        registryEntries: NamedComponentRegistryEntries,
        providerEntries: DependencyContainerRegistry = [],
        requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        super(
            registryEntries,
            providerEntries,
            [
                // The mountable view request handler must go before any other request handlers that we might
                // want to return mountable views, so it can correctly handle the header.
                mountableViewRequestHandler,
                defaultComponentRuntimeRequestHandler,
                ...requestHandlers,
            ],
        );
    }

    public get IComponentDefaultFactoryName() { return this; }
    public getDefaultFactoryName() { return this.defaultComponentName; }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const componentRuntime = await runtime.createComponent(
            ContainerRuntimeFactoryWithDefaultComponent.defaultComponentId,
            this.defaultComponentName,
        );
        // We need to request the component before attaching to ensure it
        // runs through its entire instantiation flow.
        await componentRuntime.request({ url:"/" });
        componentRuntime.attach();
    }
}
