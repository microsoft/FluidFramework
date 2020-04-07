/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { Provider } from "./provider";

export interface SingletonProvider<T extends keyof IComponent> {
    singleton: new () => NonNullable<IComponent[T]>;
    lazy?: boolean;
}

export const isSingletonProvider = <T extends keyof IComponent>(
    provider: Provider<T>,
): provider is SingletonProvider<T> => {
    return (
        (provider as SingletonProvider<T>).singleton !== undefined
    );
};
