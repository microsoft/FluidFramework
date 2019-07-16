/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerContext,
    IRequest,
    IRuntime,
} from "@prague/container-definitions";
import { ContainerRuntime, IComponentRegistry } from "@prague/container-runtime";

export class SimpleContainerRuntimeFactory {
    public static readonly defaultComponentId = "default";

    /**
     * Helper function to instantiate a new default runtime
     */
    public static async instantiateRuntime(
        context: IContainerContext,
        chaincode: string,
        registry: IComponentRegistry,
        generateSummaries: boolean = false,
    ): Promise<IRuntime> {
        // debug(`instantiateRuntime(chaincode=${chaincode},registry=${JSON.stringify(registry)})`);
        const runtime = await ContainerRuntime.load(context, registry, this.createRequestHandler.bind(this), { generateSummaries });
        // debug("runtime loaded.");

        // On first boot create the base component
        if (!runtime.existing) {
            // debug(`createAndAttachComponent(chaincode=${chaincode})`);
            runtime.createComponent(this.defaultComponentId, chaincode)
                .then((componentRuntime) => {
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

            // debug(`awaiting component ${componentId}`);
            const component = await runtime.getComponentRuntime(componentId, true);
            // debug(`have component ${componentId}`);

            // And then defer the handling of the request to the component
            return component.request({ url: pathForComponent });
        };
    }
}
