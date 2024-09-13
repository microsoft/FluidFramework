/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Brand, BrandedType, NameFromBranded, ValueFromBranded } from "./brand.js";
import type { isAny } from "./typeCheck.js";

/**
 * Converts a Branded type into an "opaque" handle.
 * This prevents the value from being used directly, but does not fully type erase it.
 * @remarks
 * Like {@link @fluidframework/core-interfaces#ErasedType},
 * but more type safe and cannot be used to hide the internal type from API extractor at package boundaries.
 *
 * The type can be recovered using {@link extractFromOpaque},
 * however if we assume only code that produces these "opaque" handles does that conversion,
 * they can function like opaque handles.
 *
 * Recommended usage is to use `interface` instead of `type` so tooling (such as tsc and refactoring tools)
 * uses the type name instead of expanding it:
 * ```typescript
 * export interface MyType extends Opaque<Brand<string, "myPackage.MyType">>{}
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Opaque<T extends Brand<any, unknown>> = T extends BrandedType<
	infer ValueType,
	infer Name
>
	? BrandedType<ValueType, Name>
	: never;

/**
 * See {@link extractFromOpaque}.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExtractFromOpaque<TOpaque extends BrandedType<any, unknown>> =
	TOpaque extends BrandedType<infer ValueType, infer Name>
		? isAny<ValueType> extends true
			? unknown
			: Brand<ValueType, Name>
		: never;

/**
 * Converts a {@link Opaque} handle to the underlying branded type.
 *
 * It is assumed that only code that produces these "opaque" handles does this conversion,
 * allowing these handles to be considered opaque.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractFromOpaque<TOpaque extends BrandedType<any, unknown>>(
	value: TOpaque,
): ExtractFromOpaque<TOpaque> {
	return value as ExtractFromOpaque<TOpaque>;
}

/**
 * Adds a type {@link Brand} to a value, returning it as a {@link Opaque} handle.
 *
 * Only do this when specifically allowed by the requirements of the type being converted to.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function brandOpaque<T extends BrandedType<any, unknown>>(
	value: isAny<ValueFromBranded<T>> extends true ? never : ValueFromBranded<T>,
): BrandedType<ValueFromBranded<T>, NameFromBranded<T>> {
	return value as BrandedType<ValueFromBranded<T>, NameFromBranded<T>>;
}
