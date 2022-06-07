/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Invariant, isAny } from "./typeCheck";

/**
 * Constructs a "Branded" type, adding a type-checking only field to `ValueType`.
 *
 * Two usages of `Brand` should never use the same `Name`.
 * If they do, the resulting types will be assignable which defeats the point of this type.
 *
 * This type is constructed such that the first line of type errors when assigning mismatched branded types will be:
 * `Type 'Name1' is not assignable to type 'Name2'.`
 *
 * These branded types are not opaque: A `Brand<A, B>` can still be used as a `B`.
 */
export type Brand<ValueType, Name extends string> = ValueType &
    BrandedType<ValueType, Name>;

/**
 * Helper for {@link Brand}.
 * This is split out into its own as thats the only way to:
 * - have doc comments for the field.
 * - make the field protected (so you don't accidentally try and read it).
 * - get nominal typing (so types produced without using this class can never be assignable to it).
 * - allow use as {@link Opaque} branded type (not assignable to `ValueType`, but captures `ValueType`).
 *
 * See {@link MakeNominal} for some more details.
 *
 * Do not use this class with `instanceof`: this will always be false at runtime,
 * but the compiler may think its true in some cases.
 */
export abstract class BrandedType<ValueType, Name extends string> {
    protected _typeCheck?: Invariant<ValueType>;
    /**
     * Compile time only marker to make type checking more strict.
     * This field will not exist at runtime and accessing it is invalid.
     * See {@link Brand} for details.
     */
    protected readonly _type_brand!: Name;

    /**
     * This class should never exist at runtime, so make it un-constructable.
     */
    private constructor() {}
}

/**
 * Converts a Branded type into an "opaque" handle.
 * This prevents the value from being used directly, but does not fully type erase it
 * (and this its not really fully opaque):
 * The type can be recovered using {@link extractFromOpaque},
 * however if we assume only code that produces these "opaque" handles does that conversion,
 * they can function like opaque handles.
 */
export type Opaque<T extends Brand<any, string>> = T extends Brand<
    infer ValueType,
    infer Name
>
    ? BrandedType<ValueType, Name>
    : never;

/**
 * See {@link extractFromOpaque}.
 */
export type ExtractFromOpaque<TOpaque extends BrandedType<any, string>> =
    TOpaque extends BrandedType<infer ValueType, infer Name>
        ? isAny<ValueType> extends true ? unknown : Brand<ValueType, Name>
        : never;

type ValueFromBranded<T extends BrandedType<any, string>> =
    T extends BrandedType<infer ValueType, string> ? ValueType : never;
type NameFromBranded<T extends BrandedType<any, string>> =
    T extends BrandedType<any, infer Name> ? Name : never;

/**
 * Converts a {@link Opaque} handle to the underlying branded type.
 *
 * It is assumed that only code that produces these "opaque" handles does this conversion,
 * allowing these handles to be considered opaque.
 */
export function extractFromOpaque<TOpaque extends BrandedType<any, string>>(
    value: TOpaque,
): ExtractFromOpaque<TOpaque> {
    return value as ExtractFromOpaque<TOpaque>;
}

/**
 * Adds a type {@link Brand} to a value.
 *
 * Only do this when specifically allowed by the requirements of the type being converted to.
 */
export function brand<T extends Brand<any, string>>(
    value: T extends BrandedType<infer ValueType, string> ? ValueType : never,
): T {
    return value as T;
}

/**
 * Adds a type {@link Brand} to a value, returning it as a  {@link Opaque} handle.
 *
 * Only do this when specifically allowed by the requirements of the type being converted to.
 */
export function brandOpaque<T extends BrandedType<any, string>>(
    value: isAny<ValueFromBranded<T>> extends true ? never : ValueFromBranded<T>,
): BrandedType<ValueFromBranded<T>, NameFromBranded<T>> {
    return value as BrandedType<ValueFromBranded<T>, NameFromBranded<T>>;
}
