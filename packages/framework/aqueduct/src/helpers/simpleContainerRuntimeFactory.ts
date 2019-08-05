/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentLoadable,
    IRequest,
} from "@prague/component-core-interfaces";
import {
    IContainerContext,
    IRuntime,
} from "@prague/container-definitions";
import { ComponentRegistryTypes, ContainerRuntime } from "@prague/container-runtime";

export class SimpleContainerRuntimeFactory {
    public static readonly defaultComponentId = "default";

    /**
     * Helper function to instantiate a new default runtime
     */
    public static async instantiateRuntime(
        context: IContainerContext,
        chaincode: string,
        registry: ComponentRegistryTypes,
        generateSummaries: boolean = false,
    ): Promise<IRuntime> {
        // debug(`instantiateRuntime(chaincode=${chaincode},registry=${JSON.stringify(registry)})`);
        const runtime = await ContainerRuntime.load(context, registry, this.createRequestHandler.bind(this), { generateSummaries });
        // debug("runtime loaded.");

        // On first boot create the base component
        if (!runtime.existing) {
            // debug(`createAndAttachComponent(chaincode=${chaincode})`);
            runtime.createComponent(this.defaultComponentId, chaincode)
                .then(async (componentRuntime) => {

                    // If the component supports forging we need to forge it.
                    const result = await componentRuntime.request({ url: "/" });
                    if (result.status !== 200 || result.mimeType !== "prague/component") {
                        return Promise.reject("Default component is not a component.");
                    }

                    const component = result.value as IComponentLoadable;
                    // We call forge the component if it supports it. Forging is the opportunity to pass props in on creation.
                    const forge = component.IComponentForge;
                    if (forge) {
                        await forge.forge();
                    }

                    componentRuntime.attach();
                })
                .catch((error) => {
                    context.error(error);
                });
        }

        return runtime;
    }

    /**
     * Add create and store a request handler as pat of ContainerRuntime load
     * @param runtime - Container Runtime instance
     */
    private static createRequestHandler(runtime: ContainerRuntime) {
        return async (request: IRequest) => {
            // debug(`request(url=${request.url})`);

            // Trim off an opening slash if it exists
            const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                ? request.url.substr(1)
                : request.url;

            // Get the next slash to identify the componentID (if it exists)
            const trailingSlash = requestUrl.indexOf("/");

            // retrieve the component ID. If from a URL we need to decode the URI component
            const componentId = requestUrl
                ? decodeURIComponent(requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash))
                : this.defaultComponentId;

            // Pull the part of the URL after the component ID
            const pathForComponent = trailingSlash !== -1 ? requestUrl.substr(trailingSlash) : requestUrl;

            let wait = true;
            if (request.headers && (typeof request.headers.wait) === "boolean")  {
                wait = request.headers.wait as boolean;
            }

            // debug(`awaiting component ${componentId}`);
            const component = await runtime.getComponentRuntime(componentId, wait);
            // debug(`have component ${componentId}`);

            // And then defer the handling of the request to the component
            return component.request({ url: pathForComponent });
        };
    }
}
