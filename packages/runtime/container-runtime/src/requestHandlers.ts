/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent, IComponentLoadable, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { ComponentFactoryTypes, ComponentRegistryTypes, IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { RequestParser } from "./requestParser";

/**
 * A request handler for the contianer runtime. Each handler should handle a specific request, and return undefined
 * if it does not apply. These handlers are called in series, so there may be other handlers before or after.
 * A handler should only return error if the request is for a route the handler owns, and there is a problem with
 * the route, or fulling the specific request.
 */
export type RuntimeRequestHandler = (request: RequestParser, runtime: IHostRuntime) => Promise<IResponse | undefined>;

export const componentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IHostRuntime) => {

        if (request.pathParts.length > 0) {
            let wait: boolean | undefined;
            if (request.headers && (typeof request.headers.wait) === "boolean") {
                wait = request.headers.wait as boolean;
            }

            const component = await runtime.getComponentRuntime(request.pathParts[0], wait);

            return component.request(request.createSubRequest(1));
        }
        return undefined;
    };

export function createComponentResponse(component: IComponent) {
    return { status: 200, mimeType: "fluid/component", value: component };
}

export function createLoadableComponentRuntimeRequestHandler(component: IComponentLoadable): RuntimeRequestHandler {
    const pathParts = RequestParser.getPathParts(component.url);
    return async (request: RequestParser, runtime: IHostRuntime) => {
        for (let i = 0; i < pathParts.length; i++) {
            if (pathParts[i] !== request.pathParts[i]) {
                return undefined;
            }
        }
        return createComponentResponse(component);
    };
}

export const systemRoutePathRoot = "_";
export const serviceRoutePathPart = "services";
export function createServiceRuntimeRequestHandler(
    serviceId: string, component: IComponent): RuntimeRequestHandler {
    return async (request: RequestParser, runtime: IHostRuntime) => {
        if (request.pathParts.length >= 3
            && request.pathParts[0] === systemRoutePathRoot
            && request.pathParts[1] === serviceRoutePathPart
            && request.pathParts[2] === serviceId) {

            if (request.pathParts.length === 3) {
                return createComponentResponse(component);
            }

            if (component.IComponentRouter) {
                return component.IComponentRouter.request(request.createSubRequest(3));
            }

            return { status: 400, mimeType: "text/plain", value: `${request.url} service is not a router` };
        }

        return undefined;
    };
}

export const catalogRoutePathPart = "catalog";
export function createCatalogRuntimeRequestHandler(
    catalogId: string, component: ComponentRegistryTypes & IComponent): RuntimeRequestHandler {
    return async (request: RequestParser, runtime: IHostRuntime) => {
        if (request.pathParts.length >= 3
            && request.pathParts[0] === systemRoutePathRoot
            && request.pathParts[1] === catalogRoutePathPart
            && request.pathParts[2] === catalogId) {

            if (request.pathParts.length === 3) {
                return createComponentResponse(component);
            } else if (component.IComponentRouter) {
                return component.IComponentRouter.request(request.createSubRequest(3));
            } else {
                let registry = component;
                let factory: ComponentFactoryTypes & IComponent;
                for (let i = 3; i < request.pathParts.length; i++) {
                    if (registry === undefined) {
                        return {
                            status: 400,
                            mimeType: "text/plain",
                            value: `${request.createSubRequest(i - 1).url} is not a registry`,
                        };
                    }
                    factory = await registry.get(request.pathParts[i]);
                    registry = factory.IComponentRegistry;
                }
                if (factory !== undefined) {
                    return createComponentResponse(factory);
                }
                return {
                    status: 404,
                    mimeType: "text/plain",
                    value: `${request.url} factory does not exist`,
                };
            }
        }

        return undefined;
    };
}
export function createCatalogRequest(catalogId: string, ...pkgsOrPathParts: string[]): IRequest {
    return {
        url: [
            systemRoutePathRoot,
            catalogRoutePathPart,
            encodeURIComponent(catalogId),
            ...pkgsOrPathParts.map(encodeURIComponent),
        ].join("/"),
    };
}
