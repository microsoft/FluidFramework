/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRouter } from "./componentRouter";
import { IComponent } from "./components";
import { IComponentLoadable } from "./componentLoadable";

export const IComponentHandleContext: keyof IProvideComponentHandleContext = "IComponentHandleContext";

export interface IProvideComponentHandleContext {
    readonly IComponentHandleContext: IComponentHandleContext;
}

/**
 * An IComponentHandleContext describes a routing context from which other IComponentHandleContexts are defined
 */
export interface IComponentHandleContext extends IComponentRouter, IProvideComponentHandleContext {
    /**
     * Path to the handle context relative to the routeContext
     * @deprecated Use `id` instead for the path relative to the routeContext.
     * For absolute path from the Container use `absolutePath`.
     */
    path: string;

    /**
     * An id for the IComponentHandleContext.
     */
    id: string;

    /**
     * The absolute path to the handle context from the Container.
     */
    absolutePath: string;

    /**
     * The parent IComponentHandleContext that has provided a route path to this IComponentHandleContext or undefined
     * at the root.
     */
    routeContext?: IComponentHandleContext;

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
    bind(handle: IComponentHandle): void;
}

export const IComponentHandle: keyof IProvideComponentHandle = "IComponentHandle";

export interface IProvideComponentHandle {
    readonly IComponentHandle: IComponentHandle;
}

/**
 * Handle to a shared component
 */
export interface IComponentHandle<
    // REVIEW: Constrain `T` to `IComponent & IComponentLoadable`?
    T = IComponent & IComponentLoadable
    > extends IComponentHandleContext, IProvideComponentHandle {
    /**
     * Returns a promise to the component referenced by the handle.
     */
    get(): Promise<T>;
}
