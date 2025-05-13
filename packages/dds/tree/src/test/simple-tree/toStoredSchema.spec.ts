/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toStoredSchema } from "../../simple-tree/toStoredSchema.js";
import { testTreeSchema } from "../cursorTestSuite.js";

describe("toStoredSchema", () => {
	it("minimal", () => {
		const schema = new SchemaFactory("com.example");
		class A extends schema.object("A", {}) {}
		toStoredSchema(A);
	});
	it("name collision", () => {
		const schema = new SchemaFactory("com.example");
		class A extends schema.object("A", {}) {}
		class B extends schema.object("A", {}) {}

		assert.throws(() => toStoredSchema([A, B]), /identifier "com.example.A"/);
	});
	it("builtins are the same", () => {
		const schema = new SchemaFactory("com.example");
		const schema2 = new SchemaFactory("com.example");
		assert.equal(schema.number, schema2.number);
	});

	for (const testSchema of testTreeSchema) {
		it(testSchema.identifier, () => {
			toStoredSchema(testSchema);
		});
	}
});
