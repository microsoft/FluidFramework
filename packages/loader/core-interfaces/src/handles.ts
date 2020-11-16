/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidRequestHandler } from "./fluidRouter";
import { IFluidObject } from "./fluidObject";
import { IFluidLoadable } from "./fluidLoadable";

// Default path - route setup for this path will be taken if request is empty
// Should be empty, to match "" in generateHandleContextPath()
export const defaultRoutePath = "";

/**
 * Base interface for IFluidHandleContext.
 * It is used to represent a route in routing, base for an object that implements IFluidHandleContext
 */
export interface IFluidRoutingContext extends IFluidRequestHandler {
    /**
     * The absolute path to the handle context from the root.
     */
    readonly absolutePath: string;

    /**
     * The parent IFluidHandleContext that has provided a route path to this IFluidHandleContext or undefined
     * at the root.
     */
    readonly routeContext?: IFluidRoutingContext;

    addRoute(path: string, route: IFluidRoutingContext): void;
}

/**
 * An IFluidHandleContext describes a routing context from which other IFluidHandleContexts are defined
 */
export interface IFluidHandleContext extends IFluidRoutingContext {
    /**
     * Flag indicating whether or not the entity has services attached.
     */
    isAttached: boolean;

    /**
     * Runs through the graph and attach the bounded handles.
     */
    attachGraph(): void;
}

/**
 * IProvideFluidHandle - interface implementing accessor to IFluidHandle
 */
export const IFluidHandle: keyof IProvideFluidHandle = "IFluidHandle";

export interface IProvideFluidHandle {
    readonly IFluidHandle: IFluidHandle;
}

/**
 * Handle to a shared FluidObject
 */
export interface IFluidHandle<
    // REVIEW: Constrain `T` to `IFluidObject & IFluidLoadable`?
    T = IFluidObject & IFluidLoadable
    > extends IProvideFluidHandle {

    /**
     * The absolute path to the handle context from the root.
     */
    absolutePath: string;

    /**
     * Flag indicating whether or not the entity has services attached.
     */
    isAttached: boolean;

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
