/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type constraint for types that are likely encodable as JSON, deserializable from JSON,
 * or have a custom alternate type.
 *
 * @remarks
 * Use `JsonTypeWith<never>` for just JSON encodable/deserializable types.
 * See {@link JsonSerializable} for encoding pitfalls.
 *
 * @privateRemarks
 * Prefer using `JsonSerializable<unknown>` or `JsonDeserialized<unknown>` over this type that
 * is an implementation detail.
 *
 * @beta
 */
export type JsonTypeWith<T> =
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| boolean
	| number
	| string
	| T
	| { [key: string | number]: JsonTypeWith<T> }
	| JsonTypeWith<T>[];

/**
 * Portion of {@link JsonTypeWith} that is an object (including array) and not null.
 *
 * @beta
 */
export type NonNullJsonObjectWith<T> =
	| { [key: string | number]: JsonTypeWith<T> }
	| JsonTypeWith<T>[];

/**
 * Deeply immutable type that is encodable as JSON and deserializable from JSON.
 *
 * @typeParam TReadonlyAlternates - Additional [immutable] types that are supported.
 *
 * @remarks
 * If `TReadonlyAlternates` is allowed as-is. So if it is not immutable, then result type
 * is not wholly immutable.
 *
 * A `const` variable is still required to avoid top-level mutability. I.e.
 * ```typescript
 * let x: ReadonlyJsonTypeWith<never> = { a: 1 };
 * ```
 * does not prevent later `x = 5`. (Does prevent )
 *
 * @beta
 */
export type ReadonlyJsonTypeWith<TReadonlyAlternates> =
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| boolean
	| number
	| string
	| TReadonlyAlternates
	| { readonly [key: string | number]: ReadonlyJsonTypeWith<TReadonlyAlternates> }
	| readonly ReadonlyJsonTypeWith<TReadonlyAlternates>[];

/**
 * Portion of {@link ReadonlyJsonTypeWith} that is an object (including array) and not null.
 *
 * @internal
 */
export type ReadonlyNonNullJsonObjectWith<TReadonlyAlternates> =
	| { readonly [key: string | number]: ReadonlyJsonTypeWith<TReadonlyAlternates> }
	| readonly ReadonlyJsonTypeWith<TReadonlyAlternates>[];
