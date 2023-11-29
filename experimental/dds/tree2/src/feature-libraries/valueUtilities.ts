/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { FluidSerializableReadOnly, isFluidHandle } from "@fluidframework/shared-object-base";
import { Value, ValueSchema, TreeValue } from "../core";

export function allowsValue(schema: ValueSchema | undefined, nodeValue: Value): boolean {
	if (schema === undefined) {
		return nodeValue === undefined;
	}
	return valueSchemaAllows(schema, nodeValue);
}

export function valueSchemaAllows<TSchema extends ValueSchema>(
	schema: TSchema,
	nodeValue: Value,
): nodeValue is TreeValue<TSchema> {
	switch (schema) {
		case ValueSchema.String:
			return typeof nodeValue === "string";
		case ValueSchema.Number:
			return typeof nodeValue === "number";
		case ValueSchema.Boolean:
			return typeof nodeValue === "boolean";
		case ValueSchema.FluidHandle:
			return isFluidHandle(nodeValue);
		case ValueSchema.Null:
			return nodeValue === null;
		default:
			unreachableCase(schema);
	}
}

export function assertAllowedValue(
	value: undefined | FluidSerializableReadOnly,
): asserts value is Value {
	assert(isAllowedValue(value), "invalid value");
}

export function isAllowedValue(value: undefined | FluidSerializableReadOnly): value is Value {
	switch (typeof value) {
		case "string":
		case "number":
		case "boolean":
			return true;
		case "object":
			return value === null || isFluidHandle(value);
		default:
			return false;
	}
}
