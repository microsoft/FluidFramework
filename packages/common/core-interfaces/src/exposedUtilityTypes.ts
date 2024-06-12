/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonTypeWith, NonNullJsonObject } from "./jsonType.js";

/**
 * Returns non-symbol keys for optional properties of an object type.
 *
 * @privateRemarks system
 * @public
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
 * Returns TTrue if T is likely serializable type, otherwise TFalse.
 * Fully not deserializable (functions, bigints, and symbols) produce TFalse
 * unless T extends TException.
 *
 * @beta
 */
export type IfNotDeserializable<T, TException, TTrue, TFalse> =
	// eslint-disable-next-line @typescript-eslint/ban-types
	/* check for only serializable value types */ T extends Function | bigint | symbol
		? /* not serializable => check for exception */ T extends TException
			? /* exception => ensure exception is not `never` */ TException extends never
				? /* `never` exception => no exception */ TFalse
				: /* proper exception => */ TTrue
			: /* no exception => */ TFalse
		: /* at least partially serializable */ TTrue;

/**
 * Returns non-symbol keys for defined, likely serializable properties of an object type.
 * Keys with fully unsupported properties (functions, bigints, and symbols) are excluded.
 *
 * @beta
 */
export type NonSymbolWithDefinedNotDeserializablePropertyOf<T extends object, TException> = Exclude<
	{
		[K in keyof T]: undefined extends T[K]
			? never
			: IfNotDeserializable<T[K], TException, K, never>;
	}[keyof T],
	undefined | symbol
>;

/**
 * Returns non-symbol keys for undefined, likely supported properties of an object type.
 * Keys with fully unsupported properties (functions, bigints, and symbols) are excluded.
 *
 * @beta
 */
export type NonSymbolWithPossiblyUndefinedNotDeserializablePropertyOf<
	T extends object,
	TException,
> = Exclude<
	{
		[K in keyof T]: undefined extends T[K]
			? Exclude<T[K], undefined> extends never
				? never
				: IfNotDeserializable<T[K], TException, K, never>
			: never;
	}[keyof T],
	undefined | symbol
>;

/**
 * Filters a type `T` to types for undefined that is not viable in an array (or tuple) that
 * must go through JSON serialization.
 * If `T` is `undefined`, then an error literal string type is returned with hopes of being
 * informative. When result is unioned with `string`, then the error string will be eclipsed
 * by the union. In that case undefined will still not be an option, but source of the error
 * may be harder to discover.
 *
 * @beta
 */
export type JsonForArrayItem<T, TReplaced, TBlessed> =
	// Some initial filtering must be provided before a test for undefined.
	// These tests are expected to match those in JsonSerializable/JsonDeserialized.
	/* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ TBlessed
		: /* test for 'unknown' */ unknown extends T
		? /* 'unknown' => */ TBlessed
		: /* test for Jsonable primitive types */ T extends  // eslint-disable-next-line @rushstack/no-new-null
				| null
				| boolean
				| number
				| string
				| TReplaced
		? /* primitive types => */ T
		: /* test for undefined possibility */ undefined extends T
		? /* undefined | ... => */ "error-array-or-tuple-may-not-allow-undefined-value-consider-null"
		: TBlessed;

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
 * Checks that type is exactly `object`.
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
export type FlattenIntersection<T> = T extends Record<string | number | symbol, unknown>
	? {
			[K in keyof T]: T[K];
	  }
	: T;

/**
 * Recursively/deeply makes all properties of a type readonly.
 *
 * @beta
 */
export type FullyReadonly<T> = {
	readonly [K in keyof T]: FullyReadonly<T[K]>;
};

/**
 * Recurses T applying {@link JsonDeserialized} filter up to RecurseLimit times.
 *
 * @beta
 */
export type JsonDeserializedRecursion<T, TReplaced, RecurseLimit> = RecurseLimit extends 10
	? JsonDeserializedImpl<T, TReplaced, 9>
	: RecurseLimit extends 9
	? JsonDeserializedImpl<T, TReplaced, 8>
	: RecurseLimit extends 8
	? JsonDeserializedImpl<T, TReplaced, 7>
	: RecurseLimit extends 7
	? JsonDeserializedImpl<T, TReplaced, 6>
	: RecurseLimit extends 6
	? JsonDeserializedImpl<T, TReplaced, 5>
	: RecurseLimit extends 5
	? JsonDeserializedImpl<T, TReplaced, 4>
	: RecurseLimit extends 4
	? JsonDeserializedImpl<T, TReplaced, 3>
	: RecurseLimit extends 3
	? JsonDeserializedImpl<T, TReplaced, 2>
	: RecurseLimit extends 2
	? JsonDeserializedImpl<T, TReplaced, 1>
	: RecurseLimit extends 1
	? JsonDeserializedImpl<T, TReplaced, 0>
	: JsonTypeWith<TReplaced>;

/**
 * Implementation of {@link JsonDeserialized}.
 */
export type JsonDeserializedImpl<
	T,
	TReplaced,
	RecurseLimit = 10,
> = /* test for 'any' */ boolean extends (T extends never ? true : false)
	? /* 'any' => */ JsonTypeWith<TReplaced>
	: /* test for 'unknown' */ unknown extends T
	? /* 'unknown' => */ JsonTypeWith<TReplaced>
	: /* test for deserializable primitive types or given alternate */ T extends  // eslint-disable-next-line @rushstack/no-new-null
			| null
			| boolean
			| number
			| string
			| TReplaced
	? /* primitive types => */ T
	: // eslint-disable-next-line @typescript-eslint/ban-types
	/* test for not a function */ Extract<T, Function> extends never
	? /* not a function => test for object */ T extends object
		? /* object => test for array */ T extends readonly (infer _)[]
			? /* array => */ {
					/* array items may not not allow undefined */
					/* use homomorphic mapped type to preserve tuple type */
					[K in keyof T]: JsonForArrayItem<
						T[K],
						TReplaced,
						JsonDeserializedRecursion<T[K], TReplaced, RecurseLimit>
					>;
			  }
			: /* not an array => test for exactly `object` */ IsExactlyObject<T> extends true
			? /* `object` => */ NonNullJsonObject
			: /* test for enum like types */ IsEnumLike<T> extends true
			? /* enum or similar simple type (return as-is) => */ T
			: /* property bag => */ FlattenIntersection<
					/* properties with symbol keys or unsupported values are removed */
					{
						/* properties with defined values are recursed */
						[K in NonSymbolWithDefinedNotDeserializablePropertyOf<
							T,
							TReplaced
						>]: JsonDeserializedRecursion<T[K], TReplaced, RecurseLimit>;
					} & {
						/* properties that may have undefined values are optional */
						[K in NonSymbolWithPossiblyUndefinedNotDeserializablePropertyOf<
							T,
							TReplaced
						>]?: JsonDeserializedRecursion<T[K], TReplaced, RecurseLimit>;
					}
			  >
		: /* not an object => */ never
	: /* function => */ never;
