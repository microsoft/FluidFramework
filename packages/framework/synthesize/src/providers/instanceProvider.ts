/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { Provider } from "./provider";

export interface InstanceProvider<T extends keyof IComponent> {
    instance: new () => NonNullable<IComponent[T]>;
    lazy?: boolean;
}

export const isInstanceProvider = <T extends keyof IComponent>(
    provider: Provider<T>,
): provider is InstanceProvider<T> => {
    return (
        (provider as InstanceProvider<T>).instance !== undefined
    );
};
