/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	generateSchemaFromSimpleSchema,
	SchemaFactory,
	toStoredSchema,
	type ImplicitFieldSchema,
	type ValidateRecursiveSchema,
} from "../../../simple-tree/index.js";
import { exportSimpleSchema } from "../../../shared-tree/index.js";
import { testTreeSchema } from "../../cursorTestSuite.js";

describe("schemaFromSimple", () => {
	function roundtrip(root: ImplicitFieldSchema): void {
		const stored = toStoredSchema(root);
		const simple = exportSimpleSchema(stored);
		// This can be lossy compared to root as metadata like property keys is lost.
		const roundTripped = generateSchemaFromSimpleSchema(simple);
		// This should exactly match stored as it should have lost the exact same information.
		const stored2 = toStoredSchema(roundTripped);
		assert.deepEqual(stored, stored2);
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

		for (const testSchema of testTreeSchema) {
			it(testSchema.identifier, () => {
				roundtrip(testSchema);
			});
		}
		it("test schema union", () => {
			roundtrip(testTreeSchema);
		});
	});
});
