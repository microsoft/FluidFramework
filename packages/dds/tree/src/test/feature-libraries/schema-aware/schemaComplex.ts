/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable unused-imports/no-unused-imports */
/* eslint-disable no-inner-declarations */

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
export const stringTaskSchema = tree("StringTask", { value: ValueSchema.String });
// Polymorphic recursive schema:
export const listTaskSchema = tree("ListTask", {
	local: { items: field(sequence, stringTaskSchema, "ListTask") },
});

export const rootFieldSchema = field(value, stringTaskSchema, listTaskSchema);

export const appSchemaData = SchemaAware.typedSchemaData(
	[[rootFieldKey, rootFieldSchema]],
	stringTaskSchema,
	listTaskSchema,
);

// Schema aware types
export type StringTask = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Editable,
	typeof stringTaskSchema
>;

export type ListTask = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Editable,
	typeof listTaskSchema
>;

type FlexibleListTask = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Flexible,
	typeof listTaskSchema
>;

type FlexibleTask = SchemaAware.TypedNode<
	["StringTask", "ListTask"],
	SchemaAware.ApiMode.Flexible,
	typeof appSchemaData
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
