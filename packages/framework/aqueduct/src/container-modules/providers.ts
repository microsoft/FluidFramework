/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { Module } from "./types";

import { IComponentModuleManager } from "./IComponentModuleManager";

export interface ClassProvider<T extends IComponent> {
    class: new () => T;
}

export const isClassProvider = <T>(
    provider: Provider<T>,
): provider is ClassProvider<T> => {
    return (
        (provider as ClassProvider<T>).class !== undefined
    );
};

export interface FactoryProvider<T extends IComponent> {
    factory: (manager?: IComponentModuleManager) => T;
}

// , K extends ConstructorParameters<T>

export const isFactoryProvider = <T>(
    provider: Provider<T>,
): provider is FactoryProvider<T> => {
    return (provider as FactoryProvider<T>).factory !== undefined;
};

export interface ValueProvider<T extends IComponent> {
    value: Module<T>;
}

export const isValueProvider = <T>(
    provider: Provider<T>,
): provider is ValueProvider<T> => {
    return (provider as ValueProvider<T>).value !== undefined;
};

export type Provider<T = any> =
    | ClassProvider<T>
    | FactoryProvider<T>
    | ValueProvider<T>;

export const isProvider = (provider: any): provider is Provider => {
    return (
        isValueProvider(provider) ||
        isClassProvider(provider) ||
        isFactoryProvider(provider)
    );
};
