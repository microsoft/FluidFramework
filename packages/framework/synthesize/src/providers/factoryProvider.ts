/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { IComponentSynthesizer } from "../IComponentSynthesize";
import { Provider } from "./provider";

export interface FactoryProvider<T extends IComponent> {
    factory: (manager?: IComponentSynthesizer) => T;
}

export const isFactoryProvider = <T>(
    provider: Provider<T>,
): provider is FactoryProvider<T> => {
    return (provider as FactoryProvider<T>).factory !== undefined;
};
