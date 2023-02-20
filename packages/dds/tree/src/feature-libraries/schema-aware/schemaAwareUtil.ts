/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Value, ValueSchema } from "../../core";
import { areSafelyAssignable, isAssignableTo, requireTrue } from "../../util";
import { PrimitiveValue } from "../contextuallyTyped";
import { TypedSchema } from "../modular-schema";

/**
 * `ValueSchema` to allowed types for that schema.
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
 * `ValueSchema` to allowed types for that schema.
 * @alpha
 */
export type PrimitiveValueSchema = ValueSchema.Number | ValueSchema.String | ValueSchema.Boolean;

{
	type PrimitiveValue2 = TypedValue<PrimitiveValueSchema>;
	type check1_ = requireTrue<areSafelyAssignable<PrimitiveValue, PrimitiveValue2>>;
}

{
	type Value2 = TypedValue<ValueSchema>;
	type check2_ = isAssignableTo<Value, Value2>;
	type check3_ = isAssignableTo<Value2, Value>;
}

/**
 * @alpha
 */
export type NamesFromSchema<T extends TypedSchema.LabeledTreeSchema<any>[]> = T extends [
	infer Head,
	...infer Tail,
]
	? [
			TypedSchema.Assume<Head, TypedSchema.LabeledTreeSchema<any>>["typeInfo"]["name"],
			...NamesFromSchema<TypedSchema.Assume<Tail, TypedSchema.LabeledTreeSchema<any>[]>>,
	  ]
	: [];

/**
 * @alpha
 */
export type ValuesOf<T> = T[keyof T];
