/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import { type TreeValue, type Value, ValueSchema } from "../core/index.js";

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

export function assertAllowedValue(
	value: undefined | FluidSerializableReadOnly,
): asserts value is TreeValue {
	assert(isTreeValue(value), 0x843 /* invalid value */);
}

/**
 * Checks if a value is a {@link TreeValue}.
 */
export function isTreeValue(nodeValue: unknown): nodeValue is TreeValue {
	switch (typeof nodeValue) {
		case "string":
		case "number":
		case "boolean":
			return true;
		default:
			return nodeValue === null || isFluidHandle(nodeValue);
	}
}
