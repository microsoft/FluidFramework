/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IFluidObject,
    IResponse,
    IRequest,
    IFluidHandle,
    IFluidLoadable,
    FluidObject,
} from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { create404Response, RequestParser } from "@fluidframework/runtime-utils";

/**
 * A request handler for the container runtime. Each handler should handle a specific request, and return undefined
 * if it does not apply. These handlers are called in series, so there may be other handlers before or after.
 * A handler should only return error if the request is for a route the handler owns, and there is a problem with
 * the route, or fulling the specific request.
 */
export type RuntimeRequestHandler = (request: RequestParser, runtime: IContainerRuntime)
    => Promise<IResponse | undefined>;

/**
 * @deprecated - please avoid adding new references to this API!  Instead prefer rootDataObjectRequestHandler.
 * It exposes internal container guts to external world, which is not ideal.
 * It also relies heavily on internal routing schema (formation of handle URIs) which will change in future
 * And last, but not least, it does not allow any policy to be implemented around GC of data stores exposed
 * through internal URIs. I.e. if there are no other references to such objects, they will be GC'd and
 * external links would get broken. Maybe that's what is needed in some cases, but better, more centralized
 * handling of external URI to internal handle is required (in future, we will support weak handle references,
 * that will allow any GC policy to be implemented by container authors.)
 */
export const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
    runtime.IFluidHandleContext.resolveHandle(request);

/**
 * A request handler to expose access to all root data stores in the container by id.
 * @param request - the request for the root data store.  The first path part must be the data store's ID.
 * @param runtime - the container runtime
 * @returns the result of the request
 */
export const rootDataStoreRequestHandler = async (request: IRequest, runtime: IContainerRuntime) => {
    const requestParser = RequestParser.create(request);
    const id = requestParser.pathParts[0];
    const wait = typeof request.headers?.wait === "boolean" ? request.headers.wait : undefined;
    try {
        // getRootDataStore currently throws if the data store is not found
        const rootDataStore = await runtime.getRootDataStore(id, wait);
        return rootDataStore.IFluidRouter.request(requestParser.createSubRequest(1));
    } catch (error) {
        return create404Response(request);
    }
};

export const createFluidObjectResponse = (fluidObject: FluidObject):
    {status: 200, mimeType: "fluid/object", value: FluidObject} => {
    return { status: 200, mimeType: "fluid/object", value: fluidObject };
};

class LegacyUriHandle<T = IFluidObject & FluidObject & IFluidLoadable> implements IFluidHandle<T> {
    public readonly isAttached = true;

    public get IFluidHandle(): IFluidHandle { return this; }

    public constructor(public readonly absolutePath, public readonly runtime: IContainerRuntimeBase) {
    }

    public attachGraph() {
        assert(false, 0x0ca /* "Trying to use legacy graph attach!" */);
    }

    public async get(): Promise<any> {
        const response = await this.runtime.IFluidHandleContext.resolveHandle({ url: this.absolutePath });
        if (response.status === 200 && response.mimeType === "fluid/object") {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return response.value;
        }
        throw new Error(`Failed to resolve container path ${this.absolutePath}`);
    }

    public bind(handle: IFluidHandle) {
        throw new Error("Cannot bind to LegacyUriHandle");
    }
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function handleFromLegacyUri<T = IFluidObject & FluidObject & IFluidLoadable>(
    uri: string,
    runtime: IContainerRuntimeBase,
): IFluidHandle<T> {
    return new LegacyUriHandle<T>(uri, runtime);
}
