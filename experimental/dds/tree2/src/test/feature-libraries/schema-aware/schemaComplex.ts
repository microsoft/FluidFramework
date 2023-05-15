/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-inner-declarations */

import { FieldKinds, ValueSchema, SchemaAware } from "../../../";
import { SchemaBuilder, TreeSchema } from "../../../feature-libraries";
import { requireAssignableTo } from "../../../util";

const builder = new SchemaBuilder("Complex Schema Example");

// Schema
export const stringTaskSchema = builder.primitive("StringTask", ValueSchema.String);
// Polymorphic recursive schema:
export const listTaskSchema = builder.objectRecursive("ListTask", {
	local: {
		items: SchemaBuilder.fieldRecursive(
			FieldKinds.sequence,
			stringTaskSchema,
			() => listTaskSchema,
		),
	},
});

{
	// Recursive objects don't get this type checking automatically, so confirm it
	type _check = requireAssignableTo<typeof listTaskSchema, TreeSchema>;
}

export const rootFieldSchema = SchemaBuilder.fieldValue(stringTaskSchema, listTaskSchema);

export const appSchemaData = builder.intoDocumentSchema(rootFieldSchema);

// Schema aware types
export type StringTask = SchemaAware.TypedNode<typeof stringTaskSchema>;

export type ListTask = SchemaAware.TypedNode<typeof listTaskSchema>;

type FlexibleListTask = SchemaAware.TypedNode<typeof listTaskSchema, SchemaAware.ApiMode.Flexible>;

type FlexibleTask = SchemaAware.AllowedTypesToTypedTrees<
	SchemaAware.ApiMode.Flexible,
	typeof rootFieldSchema.allowedTypes
>;

// Example Use
{
	const task1: FlexibleTask = "do it";
	const task2: FlexibleTask = {
		items: ["FHL", "record video"],
	};
	// const task3: FlexibleTask = {
	// 	[typeNameSymbol]: stringTaskSchema.name,
	// 	x: 1,
	// };

	function makeTask(tasks: string[]): FlexibleTask {
		if (tasks.length === 1) {
			return tasks[0];
		}
		return { items: tasks };
	}
}
