/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResponse, IComponent, IComponentRouter, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser, RuntimeRequestHandler } from "@microsoft/fluid-container-runtime";

// TODO: should this just be "s"?
export const serviceRoutePathRoot = "_services";

export type ContainerServiceRegistryEntries = Iterable<[string, (runtime: IHostRuntime) => Promise<IComponent>]>;

/**
 * This class is a simple starter class for building a Container Service. It simply provides routing
 */
export abstract class BaseContainerService implements IComponentRouter {

    public get [IComponentRouter]() { return this; }

    constructor(protected readonly runtime: IHostRuntime){
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            status: 200,
            mimeType: "fluid/component",
            value: this,
        };
    }
}

/**
 * ContainerService Factory that will only create one instance of the service for the Container.
 */
class SingletonContainerServiceFactory {

    private service: Promise<IComponent> | undefined;

    public constructor(
        private readonly serviceFn: (runtime: IHostRuntime) => Promise<IComponent>,
    ) { }

    public async getService(runtime: IHostRuntime): Promise<IComponent> {
        if (!this.service) {
            this.service =  this.serviceFn(runtime);
        }
        return this.service;
    }
}

/**
 * Given a collection of IContainerServices will produce a RequestHandler for them all
 * @param serviceRegistry - Collection of Container Services
 */
export const generateContainerServicesRequestHandler =
    (serviceRegistry: ContainerServiceRegistryEntries): RuntimeRequestHandler => {
        const factories: Map<string, SingletonContainerServiceFactory> = new Map();
        new Map(serviceRegistry).forEach((fn, id) => {
            factories.set(id, new SingletonContainerServiceFactory(fn));
        });

        return async (request: RequestParser, runtime: IHostRuntime) => {
            if (request.pathParts[0] !== serviceRoutePathRoot) {
                // If the request is not for a service we return undefined so the next handler can use it
                return undefined;
            }

            if (request.pathParts.length < 2) {
                // If there is not service to route to then return a failure
                return {
                    status: 400,
                    mimeType: "text/plain",
                    value: `request url: [${request.url}] did not specify a service to route to`,
                };
            }

            const factory = factories.get(request.pathParts[1]);
            if (!factory) {
                // If we can't find a registry entry then return
                return Promise.resolve({
                    status: 404,
                    mimeType: "text/plain",
                    value: `Could not find a valid service for request url: [${request.url}]`,
                });
            }

            const service = await factory.getService(runtime);
            const router = service[IComponentRouter];
            let subRequest = request.createSubRequest(2);
            if (router) {
                // If the service is also a router then we will route to it
                if (!subRequest) {
                    // If there is nothing left of the url we will request with empty path.
                    subRequest = { url: "" };
                }

                return router.request(subRequest);
            } else if (!router && subRequest) {
                // If there is not service to route but a sub-route was requested then we will fail.
                return {
                    status: 400,
                    mimeType: "text/plain",
                    value: `request sub-url: [${subRequest}] for service that doesn't support routing`,
                };
            }

            // Otherwise we will just return the service
            return{
                status: 200,
                mimeType: "fluid/component",
                value: service,
            };
        };
    };

