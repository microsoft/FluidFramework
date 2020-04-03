/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { Module } from "./types";

export interface ClassProvider<T extends IComponent> {
    ctor: new () => T;
}

export const isClassProvider = <T>(
    provider: Provider<T>,
): provider is ClassProvider<T> => {
    return (
        (provider as ClassProvider<T>).ctor !== undefined &&
        (provider as ClassWithArgsProvider<T>).args === undefined
    );
};

export interface ClassWithArgsProvider
<
    T extends IComponent,
    K extends new (...args: any[]) => T = new (...args: any[]) => T,
    P extends ConstructorParameters<K> = ConstructorParameters<K>,
> {
    ctor: K;
    args: P;
}

// , K extends ConstructorParameters<T>

export const isClassWithArgsProvider = <T>(
    provider: Provider<T>,
): provider is ClassWithArgsProvider<T> => {
    return (
        (provider as ClassWithArgsProvider<T>).ctor !== undefined &&
        (provider as ClassWithArgsProvider<T>).args !== undefined
    );
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
    | ClassWithArgsProvider<T>
    | ValueProvider<T>;

export const isProvider = (provider: any): provider is Provider => {
    return (
        isValueProvider(provider) ||
        isClassProvider(provider) ||
        isClassWithArgsProvider(provider)
    );
};
