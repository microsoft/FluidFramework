/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { InstanceProvider } from "./instanceProvider";
import { SingletonProvider } from "./singletonProvider";

export const isLazy = <T extends keyof IComponent>(provider: InstanceProvider<T> | SingletonProvider<T>) => {
    // Default is undefined which maps to true
    return provider.lazy === undefined ? true : provider.lazy;
};
