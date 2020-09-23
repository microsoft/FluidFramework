/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    IFluidObject,
    IResponse,
    IRequest,
    IFluidHandle,
    IFluidLoadable,
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
 * @deprecated - please avoid adding new references to this API!
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

export const createFluidObjectResponse = (fluidObject: IFluidObject) => {
    return { status: 200, mimeType: "fluid/object", value: fluidObject };
};

class LegacyUriHandle<T = IFluidObject & IFluidLoadable> implements IFluidHandle<T> {
    public readonly isAttached = true;

    public get IFluidHandle(): IFluidHandle { return this; }

    public constructor(public readonly absolutePath, public readonly runtime: IContainerRuntimeBase) {
    }

    public attachGraph() {
        assert(false);
    }

    public async get(): Promise<any> {
        const response = await this.runtime.IFluidHandleContext.resolveHandle({ url: this.absolutePath });
        if (response.status === 200 && response.mimeType === "fluid/object") {
            return response.value;
        }
        throw new Error(`Failed to resolve container path ${this.absolutePath}`);
    }

    public bind(handle: IFluidHandle) {
        throw new Error("Cannot bind to LegacyUriHandle");
    }
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function handleFromLegacyUri<T = IFluidObject & IFluidLoadable>(
    uri: string,
    runtime: IContainerRuntimeBase): IFluidHandle<T>
{
    return new LegacyUriHandle<T>(uri, runtime);
}
