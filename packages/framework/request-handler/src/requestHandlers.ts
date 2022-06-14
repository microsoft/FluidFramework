/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IResponse,
    IRequest,
    IFluidHandle,
    IFluidLoadable,
    FluidObject,
    IFluidRouter,
} from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
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
 * A request handler to expose access to all root data stores in the container by id.
 * @param request - the request for the root data store.  The first path part must be the data store's ID.
 * @param runtime - the container runtime
 * @returns the result of the request
 */
export const rootDataStoreRequestHandler = async (request: IRequest, runtime: IContainerRuntime) => {
    const requestParser = RequestParser.create(request);
    const id = requestParser.pathParts[0];
    const wait = typeof request.headers?.wait === "boolean" ? request.headers.wait : undefined;
    let rootDataStore: IFluidRouter;
    try {
        // getRootDataStore currently throws if the data store is not found
        rootDataStore = await runtime.getRootDataStore(id, wait);
    } catch (error) {
        return undefined; // continue search
    }
    try {
        return rootDataStore.IFluidRouter.request(requestParser.createSubRequest(1));
    } catch (error) {
        return { status: 500, mimeType: "fluid/object", value: error };
    }
};

export const createFluidObjectResponse = (fluidObject: FluidObject):
    { status: 200; mimeType: "fluid/object"; value: FluidObject; } => {
    return { status: 200, mimeType: "fluid/object", value: fluidObject };
};

class LegacyUriHandle<T = FluidObject & IFluidLoadable> implements IFluidHandle<T> {
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

export function handleFromLegacyUri<T = FluidObject & IFluidLoadable>(
    uri: string,
    runtime: IContainerRuntimeBase,
): IFluidHandle<T> {
    return new LegacyUriHandle<T>(uri, runtime);
}
