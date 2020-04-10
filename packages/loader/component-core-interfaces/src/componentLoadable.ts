/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "./handles";

export const IComponentLoadable: keyof IProvideComponentLoadable = "IComponentLoadable";

export interface IProvideComponentLoadable {
    readonly IComponentLoadable: IComponentLoadable;
}
/**
 * A shared component has a URL from which it can be referenced
 */
export interface IComponentLoadable extends IProvideComponentLoadable {
    // Absolute URL to the component within the document
    readonly url: string;

    // Handle to the loadable component. Will eventually replace the url property. But currently marked optional while
    // handles are integrated into the system.
    handle?: IComponentHandle;
}

export const IComponentRunnable: keyof IProvideComponentRunnable = "IComponentRunnable";

export interface IProvideComponentRunnable {
    readonly IComponentRunnable: IComponentRunnable;
}
export interface IComponentRunnable {
    run(...args: any[]): Promise<void>;
    stop?(reason?: string): void;
}

export const IComponentConfiguration: keyof IProvideComponentConfiguration = "IComponentConfiguration";

export interface IProvideComponentConfiguration {
    readonly IComponentConfiguration: IComponentConfiguration;
}

export interface IComponentConfiguration extends IProvideComponentConfiguration {
    canReconnect: boolean;
    scopes: string[];
}
