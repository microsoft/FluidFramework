/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema } from "../../simple-tree/toFlexSchema.js";

describe("toFlexSchema", () => {
	it("minimal", () => {
		const schema = new SchemaFactory("com.example");
		class A extends schema.object("A", {}) {}
		toFlexSchema(A);
	});
	it("name collision", () => {
		const schema = new SchemaFactory("com.example");
		class A extends schema.object("A", {}) {}
		class B extends schema.object("A", {}) {}

		assert.throws(() => toFlexSchema([A, B]), /identifier "com.example.A"/);
	});
	it("builtins are the same", () => {
		const schema = new SchemaFactory("com.example");
		const schema2 = new SchemaFactory("com.example");
		assert.equal(schema.number, schema2.number);
	});
});
