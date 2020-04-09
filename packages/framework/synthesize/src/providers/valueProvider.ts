/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { RequiredComponentProvider } from "../types";
import { Provider } from "./provider";

export interface ValueProvider<T extends keyof IComponent> {
    value: RequiredComponentProvider<T>;
}

export const isValueProvider = <T extends keyof IComponent>(
    provider: Provider<T>,
): provider is ValueProvider<T> => {
    return (provider as ValueProvider<T>).value !== undefined;
};
