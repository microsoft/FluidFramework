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
import { SchemaBuilder, TreeSchema } from "../../../feature-libraries";

// Aliases for conciseness
const { value, sequence } = FieldKinds;
const builder = new SchemaBuilder("Complex Schema Example");

// Schema
export const stringTaskSchema = builder.primitive("StringTask", ValueSchema.String);
// Polymorphic recursive schema:
export const listTaskSchema = builder.object("ListTask", {
	local: {
		items: SchemaBuilder.fieldSequence(
			// TODO: proper recursive schema
			SchemaBuilder.union(stringTaskSchema, (): TreeSchema => listTaskSchema),
		),
	},
});

export const rootFieldSchema = SchemaBuilder.fieldValue(
	SchemaBuilder.union(stringTaskSchema, listTaskSchema),
);

export const appSchemaData = builder.intoDocumentSchema(rootFieldSchema);

// Schema aware types
export type StringTask = SchemaAware.NodeDataFor<
	SchemaAware.ApiMode.Editable,
	typeof stringTaskSchema
>;

export type ListTask = SchemaAware.NodeDataFor<SchemaAware.ApiMode.Editable, typeof listTaskSchema>;

type FlexibleListTask = SchemaAware.NodeDataFor<
	SchemaAware.ApiMode.Flexible,
	typeof listTaskSchema
>;

type FlexibleTask = SchemaAware.TypedNode<
	typeof listTaskSchema | typeof stringTaskSchema,
	SchemaAware.ApiMode.Flexible
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
