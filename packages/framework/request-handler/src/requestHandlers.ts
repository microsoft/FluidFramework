/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidObject, IFluidLoadable, IResponse } from "@fluidframework/component-core-interfaces";
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

export const componentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length > 0) {
            let wait: boolean | undefined;
            if (typeof request.headers?.wait === "boolean") {
                wait = request.headers.wait;
            }

            const component = await runtime.getDataStore(request.pathParts[0], wait);
            const subRequest = request.createSubRequest(1);
            if (subRequest !== undefined) {
                return component.request(subRequest);
            }
        }
        return undefined;
    };

export const createComponentResponse = (component: IFluidObject) => {
    return { status: 200, mimeType: "fluid/object", value: component };
};

export function createLoadableComponentRuntimeRequestHandler(component: IFluidLoadable): RuntimeRequestHandler {
    const pathParts = RequestParser.getPathParts(component.url);
    return async (request: RequestParser, runtime: IContainerRuntime) => {
        for (let i = 0; i < pathParts.length; i++) {
            if (pathParts[i] !== request.pathParts[i]) {
                return undefined;
            }
        }
        return createComponentResponse(component);
    };
}
