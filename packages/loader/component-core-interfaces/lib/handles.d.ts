/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidRouter } from "./fluidRouter";
import { IFluidObject } from "./fluidObject";
import { IFluidLoadable } from "./fluidLoadable";
export declare const IFluidHandleContext: keyof IProvideFluidHandleContext;
export interface IProvideFluidHandleContext {
    readonly IFluidHandleContext: IFluidHandleContext;
}
/**
 * An IFluidHandleContext describes a routing context from which other IFluidHandleContexts are defined
 */
export interface IFluidHandleContext extends IFluidRouter, IProvideFluidHandleContext {
    /**
     * @deprecated - Use `absolutePath` to get the path to the handle context from the root.
     * Path to the handle context relative to the routeContext
     */
    path: string;
    /**
     * The absolute path to the handle context from the root.
     */
    absolutePath: string;
    /**
     * The parent IFluidHandleContext that has provided a route path to this IFluidHandleContext or undefined
     * at the root.
     */
    routeContext?: IFluidHandleContext;
    /**
     * Flag indicating whether or not the entity has services attached.
     */
    isAttached: boolean;
    /**
     * Runs through the graph and attach the bounded handles.
     */
    attachGraph(): void;
    /**
     * Binds the given handle to this one or attach the given handle if this handle is attached.
     * A bound handle will also be attached once this handle is attached.
     */
    bind(handle: IFluidHandle): void;
}
export declare const IFluidHandle: keyof IProvideFluidHandle;
export interface IProvideFluidHandle {
    readonly IFluidHandle: IFluidHandle;
}
/**
 * Handle to a shared FluidObject
 */
export interface IFluidHandle<T = IFluidObject & IFluidLoadable> extends IFluidHandleContext, IProvideFluidHandle {
    /**
     * Returns a promise to the Fluid Object referenced by the handle.
     */
    get(): Promise<T>;
}
//# sourceMappingURL=handles.d.ts.map