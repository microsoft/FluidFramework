/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaAware, typeNameSymbol, valueSymbol, SchemaBuilder, leaf } from "../../../";

const builder = new SchemaBuilder({ scope: "Simple Schema" });

// Schema
export const pointSchema = builder.object("point", {
	x: builder.number,
	y: builder.number,
});

export const appSchemaData = builder.intoSchema(builder.sequence(pointSchema));

// Schema aware types

// Example Use

// More Schema aware APIs
{
	type FlexibleNumber = SchemaAware.TypedNode<typeof leaf.number, SchemaAware.ApiMode.Flexible>;

	type FlexiblePoint = SchemaAware.TypedNode<typeof pointSchema, SchemaAware.ApiMode.Flexible>;

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
