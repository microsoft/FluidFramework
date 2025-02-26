/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { ObjectOptions } from "@sinclair/typebox";

import { type _InlineTrick, fail, objectToMap } from "../util/index.js";

/**
 * This module contains utilities for an encoding of a discriminated union that is efficient to validate using
 * a JSON schema validator.
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
 */

/**
 * Options to configure a TypeBox schema as a discriminated union that is simple to validate data against.
 *
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
 */
export const unionOptions: ObjectOptions = {
	additionalProperties: false,
	minProperties: 1,
	maxProperties: 1,
};

/**
 * An object containing functions for each member of the union.
 *
 * See {@link DiscriminatedUnionDispatcher}.
 */
export type DiscriminatedUnionLibrary<
	TUnion extends object,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	TArgs extends any[],
	TResult,
> = [
	{
		readonly [Property in keyof TUnion]-?: (
			value: Required<TUnion>[Property],
			...args: TArgs
		) => TResult;
	},
][_InlineTrick];

/**
 * Applies a function to the content of a [discriminated union](https://en.wikipedia.org/wiki/Tagged_union)
 * where the function to apply depends on which value from the union it holds.
 *
 * This uses a rather non-standard encoding of the union where it is an object with many differently named optional fields,
 * and which of the fields is populated determines the content type.
 * This union encoding has the advantage that schema validation (such as that implemented by TypeBox) can validate the data efficiently.
 * Other encodings--such as using an untagged union, then tagging the content types with a marker enum--require the schema validator to disambiguate the union members.
 * Most JSON validator implementations fail to recognize the marker enum determines which component of the discriminated union the data must be,
 * and end up checking against all candidate members of the union.
 *
 * @example
 *
 * The following union:
 * ```typescript
 * type Operation = Add | Subtract | Multiply | Divide;
 *
 * interface BinaryOperation {
 *     readonly left: number;
 *     readonly right: number;
 * }
 *
 * interface Add extends BinaryOperation {
 *     readonly type: "add";
 * }
 *
 * interface Subtract extends BinaryOperation {
 *     readonly type: "subtract";
 * }
 *
 * interface Multiply extends BinaryOperation {
 *     readonly type: "multiply";
 * }
 *
 * interface Divide extends BinaryOperation {
 *     readonly type: "divide";
 * }
 *
 * ```
 * Would be encoded using this strategy as:
 * ```typescript
 * interface EncodedBinaryOperation {
 *     readonly left: number;
 *     readonly right: number;
 * }
 *
 * interface EncodedOperation {
 *     add?: EncodedBinaryOperation;
 *     subtract?: EncodedBinaryOperation;
 *     multiply?: EncodedBinaryOperation;
 *     divide?: EncodedBinaryOperation;
 * }
 * ```
 * where only a single property of `EncodedOperation` is populated for a given encoded value.
 */
export class DiscriminatedUnionDispatcher<
	TUnion extends object,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	TArgs extends any[],
	TResult,
> {
	private readonly library: ReadonlyMap<
		keyof TUnion,
		(value: unknown, ...args: TArgs) => TResult
	>;

	public constructor(library: DiscriminatedUnionLibrary<TUnion, TArgs, TResult>) {
		this.library = objectToMap(
			library as Record<keyof TUnion, (value: unknown, ...args: TArgs) => TResult>,
		);
	}

	public dispatch(union: TUnion, ...args: TArgs): TResult {
		const keys = Reflect.ownKeys(union);
		assert(
			keys.length === 1,
			0x733 /* discriminated union type should have exactly one member */,
		);
		const key: keyof TUnion = keys[0] as keyof TUnion;
		const value = union[key];
		const factory =
			this.library.get(key) ?? fail(0xac2 /* missing function for union member */);
		const result = factory(value, ...args);
		return result;
	}
}
