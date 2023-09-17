/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Value, ValueSchema, PrimitiveValueSchema } from "../../core";
import { areSafelyAssignable, isAssignableTo, requireTrue } from "../../util";
import { PrimitiveValue } from "../contextuallyTyped";

/**
 * {@link ValueSchema} to allowed types for that schema.
 * @alpha
 */
export type TypedValue<TValue extends ValueSchema> = {
	[ValueSchema.Number]: number;
	[ValueSchema.String]: string;
	[ValueSchema.Boolean]: boolean;
	[ValueSchema.FluidHandle]: IFluidHandle;
}[TValue];

/**
 * {@link ValueSchema} | undefined to allowed types for that schema.
 * @alpha
 */
export type TypedValueOrUndefined<TValue extends ValueSchema | undefined> =
	TValue extends ValueSchema ? TypedValue<TValue> : undefined;

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
 * @alpha
 */
export type ValuesOf<T> = T[keyof T];
