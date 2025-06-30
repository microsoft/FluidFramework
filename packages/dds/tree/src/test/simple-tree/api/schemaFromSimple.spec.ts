/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	generateSchemaFromSimpleSchema,
	getSimpleSchema,
	SchemaFactory,
	toStoredSchema,
	type ImplicitFieldSchema,
	type ValidateRecursiveSchema,
} from "../../../simple-tree/index.js";
import { exportSimpleSchema } from "../../../shared-tree/index.js";
import { testTreeSchema } from "../../cursorTestSuite.js";
import { testSimpleTrees } from "../../testTrees.js";

describe("schemaFromSimple", () => {
	function roundtrip(root: ImplicitFieldSchema): void {
		const stored = toStoredSchema(root);
		const simpleFromStored = exportSimpleSchema(stored);
		// This can be lossy compared to root as metadata like property keys is lost.
		const roundTripped = generateSchemaFromSimpleSchema(simpleFromStored);
		// This should exactly match stored as it should have lost the exact same information.
		const stored2 = toStoredSchema(roundTripped.root);
		assert.deepEqual(stored2, stored);

		// This should not lose metadata like property keys as it doesn't go through the stored schema.
		const simpleFromView = getSimpleSchema(root);
		const roundTripped2 = generateSchemaFromSimpleSchema(simpleFromView);

		// Lossy extraction of stored schema should still be the same
		const stored3 = toStoredSchema(roundTripped2.root);
		assert.deepEqual(stored3, stored);

		// Simple schema should be the same after round trip from TreeSchema -> Simple -> TreeSchema -> Simple
		const simpleFromView2 = getSimpleSchema(roundTripped2.root);
		assert.deepEqual(simpleFromView, simpleFromView2);
	}

	describe("round trips", () => {
		it("empty", () => {
			roundtrip([]);
		});

		it("recursive", () => {
			const schema = new SchemaFactory("com.example");
			class A extends schema.objectRecursive("A", {
				field: schema.optionalRecursive([() => A]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}
			roundtrip(A);
		});

		it("leaf", () => {
			roundtrip(SchemaFactory.number);
		});

		for (const testSchema of testSimpleTrees) {
			it(testSchema.name, () => {
				roundtrip(testSchema.schema);
			});
		}
		it("test schema union", () => {
			roundtrip(testTreeSchema);
		});
	});
});
