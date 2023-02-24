/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Value, ValueSchema } from "../../core";
import { areSafelyAssignable, isAssignableTo, requireTrue } from "../../util";
import { PrimitiveValue } from "../contextuallyTyped";
import { TypedSchema } from "../modular-schema";

/**
 * {@link ValueSchema} to allowed types for that schema.
 * @alpha
 */
export type TypedValue<TValue extends ValueSchema> = {
	[ValueSchema.Nothing]: undefined;
	[ValueSchema.Number]: number;
	[ValueSchema.String]: string;
	[ValueSchema.Boolean]: boolean;
	[ValueSchema.Serializable]: Value;
}[TValue];

/**
 * {@link ValueSchema} for privative types.
 * @alpha
 */
export type PrimitiveValueSchema = ValueSchema.Number | ValueSchema.String | ValueSchema.Boolean;

{
	type PrimitiveValue2 = TypedValue<PrimitiveValueSchema>;
	type _check1 = requireTrue<areSafelyAssignable<PrimitiveValue, PrimitiveValue2>>;
}

{
	type Value2 = TypedValue<ValueSchema>;
	type _check2 = isAssignableTo<Value, Value2>;
	type _check3 = isAssignableTo<Value2, Value>;
}

/**
 * Extract names from a list of `LabeledTreeSchema`.
 *
 * @remarks
 * This uses the inner name from `typeInfo` to avoid the unneeded branding that `T["name"]` has.
 * @alpha
 */
export type NamesFromSchema<T extends TypedSchema.LabeledTreeSchema[]> = T extends [
	infer Head,
	...infer Tail,
]
	? [
			TypedSchema.Assume<Head, TypedSchema.LabeledTreeSchema>["typeInfo"]["name"],
			...NamesFromSchema<TypedSchema.Assume<Tail, TypedSchema.LabeledTreeSchema[]>>,
	  ]
	: [];

/**
 * @alpha
 */
export type ValuesOf<T> = T[keyof T];
