/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { IComponentSynthesizer } from "../IComponentSynthesize";
import { Provider } from "./provider";

export interface FactoryProvider<T extends keyof IComponent> {
    factory: (manager?: IComponentSynthesizer) => NonNullable<IComponent[T]>;
}

export const isFactoryProvider = <T extends keyof IComponent>(
    provider: Provider<T>,
): provider is FactoryProvider<T> => {
    return (provider as FactoryProvider<T>).factory !== undefined;
};
