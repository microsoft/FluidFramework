/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ValueSchema } from "../core";
import { SchemaBuilder } from "../feature-libraries";
import { brand } from "../util";

describe("SchemaBuilder unit tests", () => {
	describe("intoDocumentSchema", () => {
		it("Simple", () => {
			const schemaBuilder = new SchemaBuilder("test");
			const leafSchema = schemaBuilder.leaf("leaf", ValueSchema.Boolean);
			const schema = schemaBuilder.intoDocumentSchema(
				SchemaBuilder.fieldOptional(leafSchema),
			);

			assert.equal(schema.treeSchema.size, 1); // "leaf"
			assert.equal(schema.treeSchema.get(brand("leaf")), leafSchema);
		});
	});
});
