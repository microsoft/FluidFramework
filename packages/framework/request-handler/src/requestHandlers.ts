/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidObject, IResponse, IRequest } from "@fluidframework/core-interfaces";
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
 * @deprecated - please avoid adding new references to this API!
 * It exposes internal container guts to external world, which is not ideal.
 * It also relies heavily on internal routing schema (formation of handle URIs) which will change in future
 * And last, but not least, it does not allow any policy to be implemented around GC of components exposed
 * through internal URIs. I.e. if there are no other references to such objects, they will be GC'd and
 * external links would get broken. Maybe that's what is needed in some cases, but better, more centralized
 * handling of external URI to internal handle is required (in future, we will support weak handle references,
 * that will allow any GC policy to be implemented by container authors.)
 */
export const deprecated_innerRequestHandler = async (request: IRequest, runtime: IContainerRuntime) =>
    runtime.resolveHandle(request);

export const createComponentResponse = (component: IFluidObject) => {
    return { status: 200, mimeType: "fluid/object", value: component };
};
