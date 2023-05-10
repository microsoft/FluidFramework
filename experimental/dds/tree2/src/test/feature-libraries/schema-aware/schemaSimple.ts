/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ValueSchema, SchemaAware, typeNameSymbol, valueSymbol, SchemaBuilder } from "../../../";

const builder = new SchemaBuilder("Simple Schema");

// Schema
export const numberSchema = builder.primitive("number", ValueSchema.Number);

export const pointSchema = builder.object("point", {
	local: {
		x: SchemaBuilder.fieldValue(numberSchema),
		y: SchemaBuilder.fieldValue(numberSchema),
	},
});

export const appSchemaData = builder.intoDocumentSchema(SchemaBuilder.fieldSequence(pointSchema));

// Schema aware types
export type Number = SchemaAware.NodeDataFor<SchemaAware.ApiMode.Editable, typeof numberSchema>;

export type Point = SchemaAware.NodeDataFor<SchemaAware.ApiMode.Editable, typeof pointSchema>;

// Example Use
function dotProduct(a: Point, b: Point): number {
	return a.x * b.x + a.y * b.y;
}

// More Schema aware APIs
{
	type FlexibleNumber = SchemaAware.NodeDataFor<
		SchemaAware.ApiMode.Flexible,
		typeof numberSchema
	>;

	type FlexiblePoint = SchemaAware.NodeDataFor<SchemaAware.ApiMode.Flexible, typeof pointSchema>;

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
