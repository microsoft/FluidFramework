/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IFluidDependencySynthesizer } from ".";

export type FluidObjectKey<T extends IFluidObject> = keyof T & keyof IFluidObject;

/**
 * This is a condensed version of Record that requires the object has all
 * the IFluidObject properties as its type mapped to a string representation
 * of that property.
 *
 * @example - \{ IFoo: "IFoo" \}
 */
export type FluidObjectSymbolProvider<T extends IFluidObject> = {
    [P in FluidObjectKey<T>]: FluidObjectKey<T> & P;
};

/**
 * This is a condensed version of Record that requires the object has all
 * the IFluidObject properties as its type mapped to an object that implements
 * the property.
 */
export type AsyncRequiredFluidObjectProvider<T extends keyof IFluidObject> = {
    [P in T]: Promise<NonNullable<IFluidObject[P]>>
};

/**
 * This is a condensed version of Record that requires the object has all
 * the IFluidObject properties as its type, mapped to an object that implements
 * the property or undefined.
 */
export type AsyncOptionalFluidObjectProvider<T extends keyof IFluidObject> = {
    [P in T]: Promise<IFluidObject[P] | undefined>;
};

/**
 * Combined type for Optional and Required Async Fluid object Providers
 */
export type AsyncFluidObjectProvider<O extends keyof IFluidObject, R extends keyof IFluidObject>
    = AsyncOptionalFluidObjectProvider<O> & AsyncRequiredFluidObjectProvider<R>;

/**
 * Provided a keyof IFluidObject will ensure the type is an instance of that type
 */
export type NonNullableFluidObject<T extends keyof IFluidObject> = NonNullable<IFluidObject[T]>;

/**
 * Multiple ways to provide a Fluid object.
 */
export type FluidObjectProvider<T extends keyof IFluidObject> =
    NonNullableFluidObject<T>
    | Promise<NonNullableFluidObject<T>>
    | ((dependencyContainer: IFluidDependencySynthesizer) => NonNullableFluidObject<T>)
    | ((dependencyContainer: IFluidDependencySynthesizer) => Promise<NonNullableFluidObject<T>>);

/**
 * @deprecated - create a new DependencyContainer instead
 * ProviderEntry is a mapping of the type to the Provider
 */
export interface ProviderEntry<T extends keyof IFluidObject> {
    type: T;
    provider: FluidObjectProvider<T>
}

/**
 * @deprecated - create a new DependencyContainer instead
 * A mapping of ProviderEntries
 */
export type DependencyContainerRegistry = Iterable<ProviderEntry<any>>;
