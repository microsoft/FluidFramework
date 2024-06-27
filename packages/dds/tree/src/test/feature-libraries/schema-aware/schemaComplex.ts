/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-inner-declarations */

import { SchemaBuilder, leaf } from "../../../domains/index.js";
import {
	type AllowedTypesToFlexInsertableTree,
	FieldKinds,
	FlexFieldSchema,
	type FlexTreeNodeSchema,
	type InsertableFlexNode,
} from "../../../feature-libraries/index.js";
import type { requireAssignableTo } from "../../../util/index.js";

const builder = new SchemaBuilder({ scope: "Complex Schema Example" });

// Schema
export const stringTaskSchema = builder.fieldNode("StringTask", leaf.string);
// Polymorphic recursive schema:
export const listTaskSchema = builder.objectRecursive("ListTask", {
	items: FlexFieldSchema.createUnsafe(FieldKinds.sequence, [
		stringTaskSchema,
		() => listTaskSchema,
	]),
});

{
	// Recursive objects don't get this type checking automatically, so confirm it
	type _check = requireAssignableTo<typeof listTaskSchema, FlexTreeNodeSchema>;
}

export const rootFieldSchema = SchemaBuilder.required([stringTaskSchema, listTaskSchema]);

export const appSchemaData = builder.intoSchema(rootFieldSchema);

// Schema aware types

type FlexibleListTask = InsertableFlexNode<typeof listTaskSchema>;

type FlexibleTask = AllowedTypesToFlexInsertableTree<typeof rootFieldSchema.allowedTypes>;

type FlexibleStringTask = InsertableFlexNode<typeof stringTaskSchema>;

// Example Use
{
	const stringTask: FlexibleStringTask = "do it";
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
		return { items: tasks.map((s) => s) };
	}
}
