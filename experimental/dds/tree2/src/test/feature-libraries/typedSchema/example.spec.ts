/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ValueSchema } from "../../../core";
import { FieldKinds, SchemaBuilder } from "../../../feature-libraries";

const builder = new SchemaBuilder("example");

// Declare a simple type which just holds a number.
const numberSchema = builder.leaf("number", ValueSchema.Number);

// Declare struct
const ballSchema = builder.struct("Ball", {
	x: SchemaBuilder.fieldValue(numberSchema),
	y: SchemaBuilder.fieldValue(numberSchema),
});

// We can inspect the schema.
// Note that the inferred type here actually includes the FieldKind's editor,
// So it would be possible to derive a type safe editing API from this type.
const xField = ballSchema.structFields.get("x");

// @ts-expect-error This is an error since this field does not exist:
const invalidChildSchema = ballSchema.structFields.get("z");

// Declare an recursive aggregate type via struct fields.
// Note that the type name can be used instead of the schema to allow recursion.
const diagramSchema = builder.structRecursive("Diagram", {
	children: SchemaBuilder.fieldRecursive(FieldKinds.sequence, () => diagramSchema, ballSchema),
});

const rootField = SchemaBuilder.fieldOptional(diagramSchema);

// Collect the schema together.
const schemaData = builder.intoDocumentSchema(rootField);
