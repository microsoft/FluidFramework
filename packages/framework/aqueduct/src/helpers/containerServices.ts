/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResponse, IComponent, IComponentRouter, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerServiceFactory } from "@microsoft/fluid-framework-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser, RuntimeRequestHandler } from "@microsoft/fluid-container-runtime";

// TODO: should this just be "s"?
export const serviceRoutePathRoot = "_services";


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
export class SingletonContainerServiceFactory implements IContainerServiceFactory {

    private service: IComponent | undefined;

    public get IContainerServiceFactory() { return this; }

    public get serviceId() { return this.id; }

    public constructor(
        private readonly id: string,
        private readonly serviceFn: new (runtime: IHostRuntime) => IComponent,
    ) {
    }

    public getService(runtime: IHostRuntime): IComponent {
        if (!this.service) {
            this.service =  new this.serviceFn(runtime);
        }
        return this.service;
    }
}

/**
 * ContainerService Factory that will create a new instance for every request
 */
export class InstanceContainerServiceFactory implements IContainerServiceFactory {

    public get IContainerServiceFactory() { return this; }

    public get serviceId() { return this.id; }

    public constructor(
        private readonly id: string,
        private readonly serviceFn: new (runtime: IHostRuntime) => IComponent,
    ) {
    }

    public getService(runtime: IHostRuntime): IComponent {
        return new this.serviceFn(runtime);
    }
}

/**
 * Given a collection of IContainerServices will produce a RequestHandler for them all
 * @param serviceFactories - Collection of Container Services
 */
export const generateContainerServicesRequestHandler =
    (serviceFactories: IContainerServiceFactory[]): RuntimeRequestHandler =>
        async (request: RequestParser, runtime: IHostRuntime) => {
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

            let responseP: Promise<IResponse> | undefined;
            serviceFactories.some((factory) => {
                if (request.pathParts[1] === factory.serviceId) {
                    const service = factory.getService(runtime);
                    const router = service.IComponentRouter;
                    if (router) {
                        // If the service is also a router then we will route to it
                        let subRequest = request.createSubRequest(2);
                        if (!subRequest) {
                            // If there is nothing left of the url we will request with empty path.
                            subRequest = { url: "" };
                        }

                        responseP = router.request(subRequest);
                    } else {
                        // Otherwise we will just return the service
                        responseP = Promise.resolve({
                            status: 200,
                            mimeType: "fluid/component",
                            value: service,
                        });
                    }
                    return true;
                }
            });

            if (!responseP) {
                responseP = Promise.resolve({
                    status: 404,
                    mimeType: "text/plain",
                    value: `Could not find a valid service for request url: [${request.url}]`,
                });
            }

            const response = await responseP;
            return response;
        };

