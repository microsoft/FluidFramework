/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResponse, IFluidObject, IFluidRouter, IRequest, FluidObject } from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import {
    RequestParser,
    create404Response,
    createResponseError,
} from "@fluidframework/runtime-utils";

// TODO: should this just be "s"?
export const serviceRoutePathRoot = "_services";

export type ContainerServiceRegistryEntries = Iterable<[string, (runtime: IContainerRuntime) =>
    Promise<IFluidObject & FluidObject>]>;

/**
 * This class is a simple starter class for building a Container Service. It simply provides routing
 */
export abstract class BaseContainerService implements IFluidRouter {
    public get IFluidRouter() { return this; }

    constructor(protected readonly runtime: IContainerRuntime) {
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            status: 200,
            mimeType: "fluid/object",
            value: this,
        };
    }
}

/**
 * ContainerService Factory that will only create one instance of the service for the Container.
 */
class SingletonContainerServiceFactory {
    private service: Promise<FluidObject> | undefined;

    public constructor(
        private readonly serviceFn: (runtime: IContainerRuntime) => Promise<FluidObject>,
    ) { }

    public async getService(runtime: IContainerRuntime): Promise<IFluidObject & FluidObject> {
        if (!this.service) {
            this.service = this.serviceFn(runtime);
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

        return async (request: RequestParser, runtime: IContainerRuntime) => {
            if (request.pathParts[0] !== serviceRoutePathRoot) {
                // If the request is not for a service we return undefined so the next handler can use it
                return undefined;
            }

            if (request.pathParts.length < 2) {
                // If there is not service to route to then return a failure
                return createResponseError(400, "request did not specify a service to route to", request);
            }

            const factory = factories.get(request.pathParts[1]);
            if (!factory) {
                // If we can't find a registry entry then return
                return create404Response(request);
            }

            const service = await factory.getService(runtime);
            const router = service.IFluidRouter;
            const subRequest = request.createSubRequest(2);
            if (router) {
                return router.request(subRequest);
            }

            if (!request.isLeaf(2)) {
                // If there is not terminating route but a sub-route was requested then we will fail.
                return createResponseError(400, "request sub-url for service that doesn't support routing", request);
            }

            // Otherwise we will just return the service
            return {
                status: 200,
                mimeType: "fluid/object",
                value: service,
            };
        };
    };
