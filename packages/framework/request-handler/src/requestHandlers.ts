/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidObject, IResponse, IRequest } from "@fluidframework/component-core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";

/**
 * A request handler for the container runtime. Each handler should handle a specific request, and return undefined
 * if it does not apply. These handlers are called in series, so there may be other handlers before or after.
 * A handler should only return error if the request is for a route the handler owns, and there is a problem with
 * the route, or fulling the specific request.
 */
export type RuntimeRequestHandler = (request: RequestParser, runtime: IContainerRuntime)
    => Promise<IResponse | undefined>;

/**
 * Pipe through container request into internal request.
 * If request is empty and default url is provided, redirect request to such default url.
 *
 * @deprecated - This request handler exposes internal container structure and allows external requests
 * to get to internal objects. It is build for demo purposes only. It's recommended to never expose internal
 * structure and have mapping of external URIs to internal handles, and only use handles internally (not requests),
 * thus having more control over lifetime of external URIs and GC policy of objects that were ever exposed
 * through external URIs.
 *
 * @param defaultUrl - optional default url in case request is empty.
 */
export const defaultContainerRequestHandler = (defaultUrl?: string) => {
    return async (request: IRequest, runtime: IContainerRuntime) => {
        if (request.url === "" || request.url === "/") {
            if (defaultUrl !== undefined) {
                return runtime.resolveHandle({ url: defaultUrl, headers: request.headers });
            }
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        }
        return runtime.resolveHandle(request);
    };
};

export const createComponentResponse = (component: IFluidObject) => {
    return { status: 200, mimeType: "fluid/object", value: component };
};
