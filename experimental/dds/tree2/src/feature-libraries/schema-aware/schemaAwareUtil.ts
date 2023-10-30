/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ValueSchema, PrimitiveValueSchema, TreeValue } from "../../core";
import { areSafelyAssignable, requireTrue } from "../../util";
import { PrimitiveValue } from "../contextuallyTyped";

/**
 * {@link ValueSchema} | undefined to allowed types for that schema.
 * @alpha
 */
export type TypedValueOrUndefined<TValue extends ValueSchema | undefined> =
	TValue extends ValueSchema ? TreeValue<TValue> : undefined;

{
	type PrimitiveValue2 = TreeValue<PrimitiveValueSchema>;
	type _check1 = requireTrue<areSafelyAssignable<PrimitiveValue, PrimitiveValue2>>;
}

/**
 * @alpha
 */
export type ValuesOf<T> = T[keyof T];
