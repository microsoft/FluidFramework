/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IContainerContext } from "@microsoft/fluid-container-definitions";
import {
    componentRuntimeRequestHandler,
    ContainerRuntime,
    RequestParser,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import { IHostRuntime, NamedComponentRegistryEntries } from "@microsoft/fluid-runtime-definitions";

import { IContainerService, serviceRoutePathRoot } from "./";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class SimpleContainerRuntimeFactory {
    public static readonly defaultComponentId = "default";

    /**
     * Helper function to instantiate a new default runtime
     */
    public static async instantiateRuntime(
        context: IContainerContext,
        chaincode: string,
        registryEntries: NamedComponentRegistryEntries,
        services: IContainerService[],
        requestHandlers: RuntimeRequestHandler[] = [],
    ): Promise<ContainerRuntime> {
        // Debug(`instantiateRuntime(chaincode=${chaincode},registry=${JSON.stringify(registry)})`);
        const runtime = await ContainerRuntime.load(
            context,
            registryEntries,
            [
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                defaultComponentRuntimeRequestHandler,
                this.generateContainerServicesRequestHandler(services),
                ...requestHandlers,
                componentRuntimeRequestHandler,
            ]);
        // Debug("runtime loaded.");

        // On first boot create the base component
        if (!runtime.existing) {
            // Debug(`createAndAttachComponent(chaincode=${chaincode})`);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            SimpleContainerRuntimeFactory.createAndAttachComponent(
                runtime, SimpleContainerRuntimeFactory.defaultComponentId, chaincode);
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

    private static generateContainerServicesRequestHandler(services: IContainerService[]): RuntimeRequestHandler {
        return async (request: RequestParser, runtime: IHostRuntime) => {
            if (request.pathParts[0] !== serviceRoutePathRoot) {
                // if the request is not for a service we return undefined so the next handler can use it
                return undefined;
            }

            if (request.pathParts.length < 2) {
                // if there is not service to route to then return a failure
                return { status: 400, mimeType: "text/plain", value: `request url: [${request.url}] did not specify a service to route to` };
            }

            services.forEach(service => { 
                if (request.pathParts[1] === service.id) {
        
                    let subRequest = request.createSubRequest(2);
                    if (!subRequest) {
                        // if there is nothing left of the url we will request with empty path.
                        subRequest = { url: "" };
                    }

                    return service.getComponent(runtime).request({ url: "" });
                }
            });

            return { status: 404, mimeType: "text/plain", value: `Could not find a valid service for request url: [${request.url}]` };
        };
    }
}

export const defaultComponentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IHostRuntime) => {
        if (request.pathParts.length === 0) {
            return componentRuntimeRequestHandler(
                new RequestParser({
                    url: SimpleContainerRuntimeFactory.defaultComponentId,
                    headers: request.headers,
                }),
                runtime);
        }
        return undefined;
    };
