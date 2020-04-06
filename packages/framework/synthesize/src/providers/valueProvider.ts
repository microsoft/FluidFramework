/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { ComponentProvider } from "../types";
import { Provider } from "./provider";

export interface ValueProvider<T extends IComponent> {
    value: ComponentProvider<T>;
}

export const isValueProvider = <T>(
    provider: Provider<T>,
): provider is ValueProvider<T> => {
    return (provider as ValueProvider<T>).value !== undefined;
};
