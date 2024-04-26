/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilder, leaf } from "../../../domains/index.js";
import { FieldKinds, FlexFieldSchema } from "../../../feature-libraries/index.js";

const builder = new SchemaBuilder({ scope: "example" });

// Declare object
const ballSchema = builder.object("Ball", {
	x: leaf.number,
	y: leaf.number,
});

// Declare an recursive aggregate type via object fields.
const diagramSchema = builder.objectRecursive("Diagram", {
	children: FlexFieldSchema.createUnsafe(FieldKinds.sequence, [
		() => diagramSchema,
		ballSchema,
	]),
});

const rootField = builder.optional(diagramSchema);

// Collect the schema together.
const schemaData = builder.intoSchema(rootField);
