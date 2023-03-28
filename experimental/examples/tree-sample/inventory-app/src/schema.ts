/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ValueSchema,
	rootFieldKey,
	SchemaData,
	brand,
	EditableTree,
	FieldKinds,
	fieldSchema,
	namedTreeSchema,
} from "@fluid-internal/tree";

// TODO: Remove once primitive types are predeclared.
const float64 = namedTreeSchema({
	name: brand("number"),
	value: ValueSchema.Number,
});

// Declare the 'Inventory' schema type.
export const inventory = namedTreeSchema({
	name: brand("Contoso:Inventory"),
	localFields: {
		nuts: fieldSchema(FieldKinds.value, [float64.name]),
		bolts: fieldSchema(FieldKinds.value, [float64.name]),
	},
});

// TODO: Replace with TypeOf<T> when available.
export type Inventory = EditableTree & {
	nuts: number;
	bolts: number;
};

// The root field of the tree points to an instance of 'Inventory'.
const rootField = fieldSchema(FieldKinds.value, [inventory.name]);

// Package everything up as a 'SchemaData'.  This includes a registery of
// all referenced schema types as well as our root field declaration.
export const schema: SchemaData = {
	treeSchema: new Map([float64, inventory].map((type) => [type.name, type])),
	globalFieldSchema: new Map([[rootFieldKey, rootField]]),
};
