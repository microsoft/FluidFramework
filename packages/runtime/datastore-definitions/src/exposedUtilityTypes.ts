/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Returns non-symbol keys for optional properties of an object type.
 *
 * @beta
 */
export type NonSymbolWithOptionalPropertyOf<T extends object> = Exclude<
	{
		[K in keyof T]: T extends Record<K, T[K]> ? never : K;
	}[keyof T],
	undefined | symbol
>;

/**
 * Returns non-symbol keys for required properties of an object type.
 *
 * @beta
 */
export type NonSymbolWithRequiredPropertyOf<T extends object> = Exclude<
	{
		[K in keyof T]: T extends Record<K, T[K]> ? K : never;
	}[keyof T],
	undefined | symbol
>;

/**
 * Checks for a type that is simple class of number and string indexed types to numbers and strings.
 *
 * @beta
 */
export type IsEnumLike<T extends object> = T extends readonly (infer _)[]
	? /* array => */ false
	: T extends {
			// all numerical indices should refer to a string
			readonly [i: number]: string;
			// string indices may be string or number
			readonly [p: string]: number | string;
	  }
	? /* test for a never or any property */ true extends {
			[K in keyof T]: T[K] extends never ? true : never;
	  }[keyof T]
		? false
		: true
	: false;

/**
 * Checks for that type is exactly `object`.
 *
 * @beta
 */
export type IsExactlyObject<T extends object> =
	/* test for more than type with all optional properties */ object extends Required<T>
		? /* test for `{}` */ false extends T
			? /* `{}` => */ false
			: /* `object` => */ true
		: /* optional or required properties => */ false;

/**
 * Creates a simple object type from an intersection of multiple.
 * @privateRemarks `T extends Record` encourages tsc to process intersections within unions.
 *
 * @beta
 */
export type FlattenIntersection<T> = T extends Record<any, any>
	? {
			[K in keyof T]: T[K];
	  }
	: T;
