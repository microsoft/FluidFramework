/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "./fluidRouter";
import { IFluidObject } from "./fluidObject";
import { IFluidLoadable } from "./fluidLoadable";
import { FluidObject } from "./provider";

export const IFluidHandleContext: keyof IProvideFluidHandleContext = "IFluidHandleContext";

export interface IProvideFluidHandleContext {
    readonly IFluidHandleContext: IFluidHandleContext;
}

/**
 * An IFluidHandleContext describes a routing context from which other IFluidHandleContexts are defined
 */
export interface IFluidHandleContext extends IProvideFluidHandleContext {
    /**
     * The absolute path to the handle context from the root.
     */
    readonly absolutePath: string;

    /**
     * The parent IFluidHandleContext that has provided a route path to this IFluidHandleContext or undefined
     * at the root.
     */
    readonly routeContext?: IFluidHandleContext;

    /**
     * Flag indicating whether or not the entity has services attached.
     */
    readonly isAttached: boolean;

    /**
     * Runs through the graph and attach the bounded handles.
     */
    attachGraph(): void;

    resolveHandle(request: IRequest): Promise<IResponse>;

    /**
     * Should be called when a new reference is added by this context. This is required so that garbage collection can
     * identify all references added in the system.
     * @param sourcePath - The path of the object that added the reference.
     * @param referencedHandle - The handle of the object that is referenced.
     *
     * TODO: Optional for backwards compatibility.
     */
    referenceAdded?(sourcePath: string, referencedHandle: IFluidHandle): void;
}

export const IFluidHandle: keyof IProvideFluidHandle = "IFluidHandle";

export interface IProvideFluidHandle {
    readonly IFluidHandle: IFluidHandle;
}

/**
 * Handle to a shared FluidObject
 */
export interface IFluidHandle<
    // REVIEW: Constrain `T` to something? How do we support dds and datastores safely?
    T = IFluidObject & FluidObject & IFluidLoadable
    > extends IProvideFluidHandle {

    /**
     * @deprecated - Do not use handle's path for routing. Use `get` to get the underlying object.
     *
     * The absolute path to the handle context from the root.
     */
    readonly absolutePath: string;

    /**
     * Flag indicating whether or not the entity has services attached.
     */
    readonly isAttached: boolean;

    /**
     * Runs through the graph and attach the bounded handles.
     */
    attachGraph(): void;

    /**
     * Returns a promise to the Fluid Object referenced by the handle.
     */
    get(): Promise<T>;

    /**
     * Binds the given handle to this one or attach the given handle if this handle is attached.
     * A bound handle will also be attached once this handle is attached.
     */
    bind(handle: IFluidHandle): void;
}
