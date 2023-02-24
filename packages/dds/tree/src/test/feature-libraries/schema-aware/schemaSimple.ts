/* eslint-disable no-inner-declarations */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKinds,
	rootFieldKey,
	ValueSchema,
	TypedSchema,
	SchemaAware,
	typeNameSymbol,
	valueSymbol,
} from "../../../";

// Aliases for conciseness
const { value, sequence } = FieldKinds;
const { tree, field } = TypedSchema;

// Schema
export const numberSchema = tree("number", { value: ValueSchema.Number });

export const pointSchema = tree("point", {
	local: {
		x: field(value, numberSchema),
		y: field(value, numberSchema),
	},
});

export const rootFieldSchema = field(sequence, pointSchema);

export const appSchemaData = SchemaAware.typedSchemaData(
	new Map([[rootFieldKey, rootFieldSchema]]),
	numberSchema,
	pointSchema,
);

// Schema aware types
export type Number = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Normalized,
	typeof numberSchema
>;

export type Point = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Normalized,
	typeof pointSchema
>;

// Example Use
{
	const point: Point = {
		[typeNameSymbol]: pointSchema.name,
		x: 1,
		y: 2,
	};

	function dotProduct(a: Point, b: Point): number {
		return a.x * b.x + a.y * b.y;
	}
}

// More Schema aware APIs
{
	type FlexibleNumber = SchemaAware.NodeDataFor<
		typeof appSchemaData,
		SchemaAware.ApiMode.Flexible,
		typeof numberSchema
	>;

	type FlexiblePoint = SchemaAware.NodeDataFor<
		typeof appSchemaData,
		SchemaAware.ApiMode.Flexible,
		typeof pointSchema
	>;

	const point: FlexiblePoint = {
		x: 1,
		y: 2,
	};

	const point2: FlexiblePoint = {
		[typeNameSymbol]: pointSchema.name,
		x: 1,
		y: { [valueSymbol]: 1 },
	};
}
