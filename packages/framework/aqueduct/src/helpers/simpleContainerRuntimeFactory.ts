/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext } from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { ComponentRegistryTypes, IHostRuntime } from "@microsoft/fluid-runtime-definitions";

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
    ): Promise<ContainerRuntime> {
        // debug(`instantiateRuntime(chaincode=${chaincode},registry=${JSON.stringify(registry)})`);
        const runtime = await ContainerRuntime.load(context, registry, this.createRequestHandler.bind(this), { generateSummaries });
        // debug("runtime loaded.");

        // On first boot create the base component
        if (!runtime.existing) {
            // debug(`createAndAttachComponent(chaincode=${chaincode})`);
            // tslint:disable-next-line: no-floating-promises
            this.createAndAttachComponent(runtime, this.defaultComponentId, chaincode);
        }

        return runtime;
    }

    /**
     * Calls create, initialize, and attach on a new component.
     *
     * @param runtime - It is the runtime for the container.
     * @param id - unique component id for the new component
     * @param pkg - package name for the new component
     */
    public static async createAndAttachComponent<T>(
        runtime: IHostRuntime,
        id: string,
        pkg: string,
    ): Promise<T> {
        try {
            const componentRuntime = await runtime.createComponent(id, pkg);

            // If the component supports forging we need to forge it.
            const result = await componentRuntime.request({ url: "/" });
            if (result.status !== 200 || result.mimeType !== "fluid/component") {
                return Promise.reject("Default component is not a component.");
            }

            componentRuntime.attach();

            return result.value as T;
        } catch (error) {
            runtime.error(error);
            throw error;
        }
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
            if (request.headers && (typeof request.headers.wait) === "boolean") {
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
