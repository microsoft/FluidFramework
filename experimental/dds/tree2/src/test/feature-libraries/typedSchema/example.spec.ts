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

// Declare an recursive aggregate type via object fields.
const diagramSchema = builder.objectRecursive("Diagram", {
	children: TreeFieldSchema.createUnsafe(FieldKinds.sequence, [() => diagramSchema, ballSchema]),
});

const rootField = builder.optional(diagramSchema);

// Collect the schema together.
const schemaData = builder.intoSchema(rootField);
