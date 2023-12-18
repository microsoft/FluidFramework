/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
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
	if (typeof value !== "object" || value === null || !("IFluidHandle" in value)) {
		return false;
	}

	const handle = (value as Partial<IFluidHandle>).IFluidHandle;
	// Regular Json compatible data can have fields named "IFluidHandle" (especially if field names come from user data).
	// Separate this case from actual Fluid handles by checking for a circular reference: Json data can't have this circular reference so it is a safe way to detect IFluidHandles.
	const isHandle = handle === value;
	// Since the requirement for this reference to be cyclic isn't particularly clear in the interface (typescript can't model that very well)
	// do an extra test.
	// Since json compatible data shouldn't have methods, and IFluidHandle requires one, use that as a redundant check:
	const getMember = (value as Partial<IFluidHandle>).get;
	if (typeof getMember !== "function") {
		return false;
	}

	return isHandle;
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
