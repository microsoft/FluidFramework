/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "./handles";


export const IComponentLoadable = Symbol.for("IComponentLoadable");

export interface IProvideComponentLoadable {
    readonly [IComponentLoadable]: IComponentLoadable;
}
/**
 * A shared component has a URL from which it can be referenced
 */
export interface IComponentLoadable extends IProvideComponentLoadable {
    // Absolute URL to the component within the document
    url: string;

    // Handle to the loadable component. Will eventually replace the url property. But currently marked optional while
    // handles are integrated into the system.
    handle?: IComponentHandle;
}

export const IComponentRunnable = Symbol.for("IComponentRunnable");

export interface IProvideComponentRunnable {
    readonly [IComponentRunnable]: IComponentRunnable;
}

export interface IComponentRunnable {
    run(...args: any[]): Promise<void>;
    stop?(reason?: string): void;
}

export const IComponentConfiguration = Symbol.for("IComponentConfiguration");

export interface IProvideComponentConfiguration {
    readonly [IComponentConfiguration]: IComponentConfiguration;
}

export interface IComponentConfiguration extends IProvideComponentConfiguration {
    canReconnect: boolean;
    scopes: string[];
}
