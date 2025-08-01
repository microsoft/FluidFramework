/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, SchemaFactoryAlpha } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { convertField, toStoredSchema } from "../../simple-tree/toStoredSchema.js";
import { testTreeSchema } from "../cursorTestSuite.js";
import { FieldKinds } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";

describe("toStoredSchema", () => {
	describe("toStoredSchema", () => {
		it("minimal", () => {
			const schema = new SchemaFactory("com.example");
			class A extends schema.object("A", {}) {}
			const stored = toStoredSchema(A);
			assert.equal(stored.rootFieldSchema.kind, FieldKinds.required.identifier);
			assert.deepEqual(stored.rootFieldSchema.types, new Set([A.identifier]));
			const storedNodeSchema = stored.nodeSchema.get(brand(A.identifier));
			assert(storedNodeSchema !== undefined);
			assert.equal(storedNodeSchema.encodeV1, "object");
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

	describe("convertField", () => {
		it("minimal", () => {
			const stored = convertField(SchemaFactoryAlpha.required(SchemaFactory.number));
			assert.equal(stored.kind, FieldKinds.required.identifier);
			assert.deepEqual(stored.types, new Set([SchemaFactory.number.identifier]));
		});

		it("staged - omitted", () => {
			const stored = convertField(
				SchemaFactoryAlpha.required(SchemaFactoryAlpha.staged(SchemaFactory.number)),
			);
			assert.equal(stored.kind, FieldKinds.required.identifier);
			assert.deepEqual(stored.types, new Set([]));
		});

		it("staged - included", () => {
			const stored = convertField(
				SchemaFactoryAlpha.required(SchemaFactoryAlpha.staged(SchemaFactory.number)),
			);
			assert.equal(stored.kind, FieldKinds.required.identifier);
			assert.deepEqual(stored.types, new Set([SchemaFactory.number.identifier]));
		});
	});
});
