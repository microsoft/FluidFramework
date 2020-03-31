/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRouter } from "./componentRouter";
import { IComponent } from "./components";
import { IComponentLoadable } from "./componentLoadable";

export const IComponentHandleContext = "IComponentHandleContext";

export interface IProvideComponentHandleContext {
    readonly [IComponentHandleContext]: IComponentHandleContext;
}

/**
 * An IComponentHandleContext describes a routing context from which other IComponentHandleContexts are defined
 */
export interface IComponentHandleContext extends IComponentRouter, IProvideComponentHandleContext {
    /**
     * Path to the handle context relative to the routeContext
     */
    path: string;

    /**
     * The parent IComponentHandleContext that has provided a route path to this IComponentHandleContext or undefined
     * at the root.
     */
    routeContext?: IComponentHandleContext;

    /**
     * Flag indicating whether or not the component is attached to the document. An attached context is
     * one that is accessible to all users within the collaboration window.
     */
    isAttached: boolean;

    /**
     * Attaches the context and any bound handles to the document.
     */
    attach(): void;

    /**
     * Binds the given handle to this one. A bound handle will also be attached once this handle is attached.
     */
    bind(handle: IComponentHandle): void;
}

export const IComponentHandle = "IComponentHandle";

export interface IProvideComponentHandle {
    readonly [IComponentHandle]: IComponentHandle;
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
