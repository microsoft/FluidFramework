/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { InstanceProvider, isInstanceProvider } from "./instanceProvider";
import { FactoryProvider, isFactoryProvider } from "./factoryProvider";
import { ValueProvider, isValueProvider } from "./valueProvider";
import { SingletonProvider, isSingletonProvider } from "./singletonProvider";

export type Provider<T extends keyof IComponent> =
    | InstanceProvider<T>
    | FactoryProvider<T>
    | SingletonProvider<T>
    | ValueProvider<T>;

export const isProvider = (provider: any): provider is Provider<any> => {
    return (
        isInstanceProvider(provider) ||
        isFactoryProvider(provider) ||
        isSingletonProvider(provider) ||
        isValueProvider(provider)
    );
};
