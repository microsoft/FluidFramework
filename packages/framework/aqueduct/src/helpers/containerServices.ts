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

    public get IComponentRouter() { return this; }

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

    private service: IComponent | undefined;

    public constructor(
        public readonly id: string,
        private readonly serviceFn: (runtime: IHostRuntime) => Promise<IComponent>,
    ) {
    }

    public async getService(runtime: IHostRuntime): Promise<IComponent> {
        if (!this.service) {
            this.service =  await this.serviceFn(runtime);
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
        const factories: SingletonContainerServiceFactory[] = [];
        new Map(serviceRegistry).forEach((fn, id) => {
            factories.push(new SingletonContainerServiceFactory(id, fn));
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

            let serviceP: Promise<IComponent> | undefined;
            factories.some((factory) => {
                if (request.pathParts[1] === factory.id) {
                    serviceP = factory.getService(runtime);
                    return true;
                }
            });

            // If we can't find a registry entry then return
            if (!serviceP) {
                return Promise.resolve({
                    status: 404,
                    mimeType: "text/plain",
                    value: `Could not find a valid service for request url: [${request.url}]`,
                });
            }

            const service = await serviceP;
            const router = service.IComponentRouter;
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

