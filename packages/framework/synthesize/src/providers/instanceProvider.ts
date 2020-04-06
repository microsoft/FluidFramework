/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { Provider } from "./provider";

export interface InstanceProvider<T extends IComponent> {
    instance: new () => T;
    lazy?: boolean;
}

export const isInstanceProvider = <T>(
    provider: Provider<T>,
): provider is InstanceProvider<T> => {
    return (
        (provider as InstanceProvider<T>).instance !== undefined
    );
};
