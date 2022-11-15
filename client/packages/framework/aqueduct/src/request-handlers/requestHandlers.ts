/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject, IRequest, IRequestHeader, IResponse } from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidMountableViewClass } from "@fluidframework/view-interfaces";
import { RuntimeRequestHandler, buildRuntimeRequestHandler } from "@fluidframework/request-handler";
import { RequestParser, create404Response } from "@fluidframework/runtime-utils";

/**
 * A mountable view is only required if the view needs to be mounted across a bundle boundary.  Mounting across
 * bundle boundaries breaks some frameworks, so the mountable view is used to ensure the mounting is done within
 * the same bundle as the view.  For example, React hooks don't work if mounted across bundles since there will
 * be two React instances, breaking the Rules of Hooks.  When cross-bundle mounting isn't required, the mountable
 * view isn't necessary.
 *
 * When a request is received with a mountableView: true header, this request handler will reissue the request
 * without the header, and respond with a mountable view of the given class using the response.
 * @param MountableViewClass - The type of mountable view to use when responding
 */
export const mountableViewRequestHandler =
    (MountableViewClass: IFluidMountableViewClass, handlers: RuntimeRequestHandler[]) => {
        const nestedHandler = buildRuntimeRequestHandler(...handlers);
        return async (request: RequestParser, runtime: IContainerRuntime) => {
            const mountableView = request.headers?.mountableView === true;
            let newRequest: IRequest = request;
            if (mountableView) {
                // Reissue the request without the mountableView header.
                // We'll repack whatever the response is if we can.
                const headers: IRequestHeader = { ...request.headers };
                delete (headers as any).mountableView;
                newRequest = {
                    url: request.url,
                    headers,
                };
            }
            const response = await nestedHandler(newRequest, runtime);

            if (mountableView && response.status === 200 && MountableViewClass.canMount(response.value)) {
                return {
                    status: 200,
                    mimeType: "fluid/object",
                    value: new MountableViewClass(response.value),
                };
            }
            return response;
        };
    };

/**
 * Pipe through container request into internal request.
 * If request is empty and default url is provided, redirect request to such default url.
 * @param defaultRootId - optional default root data store ID to pass request in case request is empty.
 */
export const defaultRouteRequestHandler = (defaultRootId: string) => {
    return async (request: IRequest, runtime: IContainerRuntime) => {
        const parser = RequestParser.create(request);
        if (parser.pathParts.length === 0) {
            return runtime.IFluidHandleContext.resolveHandle({
                url: `/${defaultRootId}${parser.query}`,
                headers: request.headers });
        }
        return undefined; // continue search
    };
};

/**
 * Default request handler for a Fluid object that returns the object itself if:
 *
 * 1. the request url is empty
 *
 * 2. the request url is "/"
 *
 * 3. the request url starts with "/" and is followed by a query param, such as /?key=value
 *
 * Returns a 404 error for any other url.
 */
export function defaultFluidObjectRequestHandler(fluidObject: FluidObject, request: IRequest): IResponse {
    return request.url === "" || request.url === "/" || request.url.startsWith("/?")
        ? { mimeType: "fluid/object", status: 200, value: fluidObject }
        : create404Response(request);
}
