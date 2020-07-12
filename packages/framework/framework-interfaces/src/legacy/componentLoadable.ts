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

    // Handle to the loadable component
    handle: IComponentHandle;
}
