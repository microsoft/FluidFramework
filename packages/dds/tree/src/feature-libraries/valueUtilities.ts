/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, fluidHandleSymbol } from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils";
import { TreeValue, Value, ValueSchema } from "../core/index.js";

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

/**
 * Use for readonly view of Json compatible data that can also contain IFluidHandles.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 */
export type FluidSerializableReadOnly =
	| IFluidHandle
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| readonly FluidSerializableReadOnly[]
	| {
			readonly [P in string]?: FluidSerializableReadOnly;
	  };

// TODO: replace test in FluidSerializer.encodeValue with this.
export function isFluidHandle(value: unknown): value is IFluidHandle {
	return typeof value === "object" && value !== null && fluidHandleSymbol in value;
}

export function assertAllowedValue(
	value: undefined | FluidSerializableReadOnly,
): asserts value is Value {
	assert(isAllowedValue(value), 0x843 /* invalid value */);
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
