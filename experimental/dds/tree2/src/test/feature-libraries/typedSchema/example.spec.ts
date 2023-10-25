/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { leaf, SchemaBuilder } from "../../../domains";
import { FieldKinds, TreeFieldSchema } from "../../../feature-libraries";

const builder = new SchemaBuilder({ scope: "example" });

// Declare object
const ballSchema = builder.object("Ball", {
	x: leaf.number,
	y: leaf.number,
});

// We can inspect the schema.
// Note that the inferred type here actually includes the FieldKind's editor,
// So it would be possible to derive a type safe editing API from this type.
const xField = ballSchema.objectNodeFields.get("x");

// @ts-expect-error This is an error since this field does not exist:
const invalidChildSchema = ballSchema.objectNodeFields.get("z");

// Declare an recursive aggregate type via object fields.
// Note that the type name can be used instead of the schema to allow recursion.
const diagramSchema = builder.objectRecursive("Diagram", {
	children: TreeFieldSchema.createUnsafe(FieldKinds.sequence, [() => diagramSchema, ballSchema]),
});

const rootField = builder.optional(diagramSchema);

// Collect the schema together.
const schemaData = builder.intoSchema(rootField);
