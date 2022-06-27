/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidDependencySynthesizer } from ".";
/**
 * This is a condensed version of Record that requires the object has all
 * the FluidObject properties as its type mapped to a string representation
 * of that property.
 *
 * @example - \{ IFoo: "IFoo" \}
 */
export type FluidObjectSymbolProvider<T> = {
    [P in keyof T]?: P;
};

/**
 * This is a condensed version of Record that requires the object has all
 * the FluidObject properties as its type mapped to an object that implements
 * the property.
 */
export type AsyncRequiredFluidObjectProvider<T> = T extends undefined ? Record<string, never> : {
    [P in keyof T]: Promise<NonNullable<Exclude<T[P], undefined | null>>>
};

/**
 * This is a condensed version of Record that requires the object has all
 * the FluidObject properties as its type, mapped to an object that implements
 * the property or undefined.
 */
export type AsyncOptionalFluidObjectProvider<T> = T extends undefined
    ? Record<string, never>
    : {
        [P in keyof T]?: Promise<T[P] | undefined>;
    };

/**
 * Combined type for Optional and Required Async Fluid object Providers
 */
export type AsyncFluidObjectProvider<O, R = undefined>
    = AsyncOptionalFluidObjectProvider<O> & AsyncRequiredFluidObjectProvider<R>;

/**
 * Multiple ways to provide a Fluid object.
 */
export type FluidObjectProvider<T> =
    NonNullable<T>
    | Promise<NonNullable<T>>
    | ((dependencyContainer: IFluidDependencySynthesizer) => NonNullable<T>)
    | ((dependencyContainer: IFluidDependencySynthesizer) => Promise<NonNullable<T>>);
