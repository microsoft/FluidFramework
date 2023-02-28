/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	typedTreeSchema as tree,
	typedFieldSchema as field,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema";

import { rootFieldKey, SchemaDataAndPolicy, ValueSchema } from "../../../../core";
import { defaultSchemaPolicy, FieldKinds } from "../../../../feature-libraries";

// Aliases for conciseness
const { optional, value, sequence } = FieldKinds;

// Declare a simple type which just holds a number.
const numberSchema = tree({
	name: "number",
	value: ValueSchema.Number,
});

// Declare an aggregate type with local fields
const ballSchema = tree({
	name: "Ball",
	local: {
		x: field(value, [numberSchema]),
		y: field(value, [numberSchema]),
	},
});

// We can inspect the schema.
// Note that the inferred type here actually includes the FieldKind's editor,
// So it would be possible to derive a type safe editing API from this type.
const xField = ballSchema.localFields.get("x");

// @ts-expect-error This is an error since this field does not exist:
const invalidChildSchema = ballSchema.localFields.get("z");

// Declare an recursive aggregate type via local fields.
// Note that the type name can be used instead of the schema to allow recursion.
const diagramSchema = tree({
	name: "Diagram",
	local: {
		children: field(sequence, ["Diagram", ballSchema]),
	},
});

const rootField = field(optional, [diagramSchema]);

// Collect the schema together.
// TODO: add APIs for this which preserve the compile time type information.
const schemaData: SchemaDataAndPolicy = {
	policy: defaultSchemaPolicy,
	globalFieldSchema: new Map([[rootFieldKey, rootField]]),
	treeSchema: new Map(
		[numberSchema, diagramSchema, ballSchema].map((schema) => [schema.name, schema]),
	),
};

// TODO: use compile time type information from schemaData to generate useful APIs, like a strongly typed EditableTree.
// Note that generating such APIs needs to involve collections of schema so that child types can be looked up by name.
// This makes modularizing the system harder. For example a library that only knows a subset of the app schema needs to be able to use EditableTree.
// TODO: Make this possible and provide an example of such modular use.
