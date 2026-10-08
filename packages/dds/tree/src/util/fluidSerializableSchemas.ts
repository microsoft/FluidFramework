/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import * as Type from "@sinclair/typebox";
// eslint-disable-next-line import-x/no-internal-modules -- Supported TypeBox custom-type API.
import { TypeSystem } from "@sinclair/typebox/system";

/**
 * TypeBox schema for an {@link IFluidHandle}.
 */
export const FluidHandleSchema = TypeSystem.Type<IFluidHandle>(
	"Fluid.Tree.IFluidHandle",
	(_schema, value) => isFluidHandle(value),
)({ type: "object" });

/**
 * TypeBox schema for a value stored on a Tree node.
 */
export const TreeValueSchema = Type.Union([
	FluidHandleSchema,
	Type.Null(),
	Type.Boolean(),
	Type.Number(),
	Type.String(),
]);

/**
 * Readonly recursively Fluid-serializable data.
 */
export type FluidSerializableReadOnly =
	| IFluidHandle
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| readonly FluidSerializableReadOnly[]
	| FluidSerializableReadOnlyObject;

/**
 * Readonly recursively Fluid-serializable record.
 */
export type FluidSerializableReadOnlyObject = {
	readonly [P in string]?: FluidSerializableReadOnly;
};

/**
 * TypeBox schema for recursively Fluid-serializable data.
 */
export const FluidSerializableReadOnlySchema = Type.Unsafe<FluidSerializableReadOnly>(
	Type.Recursive((Self) =>
		Type.Union([TreeValueSchema, Type.Array(Self), Type.Record(Type.String(), Self)]),
	),
);
