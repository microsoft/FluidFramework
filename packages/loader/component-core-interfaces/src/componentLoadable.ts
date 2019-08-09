/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "./handles";

export interface IComponentLoadable {
    // absolute URL to the component within the document
    url: string;
    readonly IComponentLoadable: IComponentLoadable;

    // Handle to the loadable component. Will eventually replace the url property. But currently marked optional while
    // handles are integrated into the system.
    handle?: IComponentHandle;
}

export interface IComponentRunnable {
    readonly IComponentRunnable: IComponentRunnable;
    run(): Promise<void>;
}

/**
 * A shared component has a URL from which it can be referenced
 */
export interface ISharedComponent extends IComponentLoadable {
    readonly IComponentLoadable: IComponentLoadable;
}

export interface IComponentConfiguration {
    readonly IComponentConfiguration: IComponentConfiguration;
    canReconnect: boolean;
}
