/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, SchemaFactoryAlpha } from "../../simple-tree/index.js";
import {
	convertField,
	getStoredSchema,
	permissiveStoredSchemaGenerationOptions,
	restrictiveStoredSchemaGenerationOptions,
	toInitialSchema,
	toStoredSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/toStoredSchema.js";
import { FieldKinds } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import {
	HasStagedAllowedTypes,
	HasStagedAllowedTypesAfterUpdate,
	testDocuments,
} from "../testTrees.js";
import { EmptyKey } from "../../core/index.js";

describe("toStoredSchema", () => {
	describe("toStoredSchema", () => {
		it("minimal", () => {
			const schema = new SchemaFactory("com.example");
			class A extends schema.object("A", {}) {}
			const stored = toStoredSchema(A, restrictiveStoredSchemaGenerationOptions);
			assert.equal(stored.rootFieldSchema.kind, FieldKinds.required.identifier);
			assert.deepEqual(stored.rootFieldSchema.types, new Set([A.identifier]));
			const storedNodeSchema = stored.nodeSchema.get(brand(A.identifier));
			assert(storedNodeSchema !== undefined);
			assert.deepEqual(storedNodeSchema.encodeV1(), {
				object: Object.create(null),
			});
		});
		it("name collision", () => {
			const schema = new SchemaFactory("com.example");
			class A extends schema.object("A", {}) {}
			class B extends schema.object("A", {}) {}

			assert.throws(
				() => toStoredSchema([A, B], restrictiveStoredSchemaGenerationOptions),
				/identifier "com.example.A"/,
			);
		});
		it("builtins are the same", () => {
			const schema = new SchemaFactory("com.example");
			const schema2 = new SchemaFactory("com.example");
			assert.equal(schema.number, schema2.number);
		});

		for (const testCase of testDocuments) {
			it(testCase.name, () => {
				toStoredSchema(testCase.schema, restrictiveStoredSchemaGenerationOptions);
				toStoredSchema(testCase.schema, permissiveStoredSchemaGenerationOptions);
			});
		}
	});

	describe("toInitialSchema with staged schema", () => {
		it("root", () => {
			const converted = toInitialSchema([
				SchemaFactoryAlpha.number,
				SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
			]);
			const field = converted.rootFieldSchema;
			assert.equal(field.types.size, 1);
		});

		it("shallow", () => {
			const schemaFactory = new SchemaFactoryAlpha("com.example");
			class TestArray extends schemaFactory.arrayAlpha("TestArray", [
				SchemaFactoryAlpha.number,
				SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
			]) {}

			const converted = toInitialSchema(TestArray);
			const node = converted.nodeSchema.get(brand(TestArray.identifier)) ?? assert.fail();
			const field = node.getFieldSchema(EmptyKey);
			assert.equal(field.types.size, 1);
		});

		it("nested", () => {
			const schemaFactory = new SchemaFactoryAlpha("com.example");
			class TestArray extends schemaFactory.arrayAlpha("TestArray", [
				SchemaFactoryAlpha.number,
				SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
			]) {}
			class Root extends schemaFactory.objectAlpha("TestObject", {
				foo: TestArray,
			}) {}
			const converted = toInitialSchema(Root);
			const node = converted.nodeSchema.get(brand(TestArray.identifier)) ?? assert.fail();
			const field = node.getFieldSchema(EmptyKey);
			assert.equal(field.types.size, 1);
		});
	});

	describe("convertField", () => {
		it("minimal", () => {
			const stored = convertField(
				SchemaFactoryAlpha.required(SchemaFactory.number),
				restrictiveStoredSchemaGenerationOptions,
			);
			assert.equal(stored.kind, FieldKinds.required.identifier);
			assert.deepEqual(stored.types, new Set([SchemaFactory.number.identifier]));
		});

		it("staged", () => {
			const storedRestrictive = convertField(
				SchemaFactoryAlpha.required(SchemaFactoryAlpha.staged(SchemaFactory.number)),
				restrictiveStoredSchemaGenerationOptions,
			);
			const storedPermissive = convertField(
				SchemaFactoryAlpha.required(SchemaFactoryAlpha.staged(SchemaFactory.number)),
				permissiveStoredSchemaGenerationOptions,
			);
			assert.equal(storedRestrictive.kind, FieldKinds.required.identifier);
			assert.deepEqual(storedRestrictive.types, new Set([]));
			assert.equal(storedPermissive.kind, FieldKinds.required.identifier);
			assert.deepEqual(storedPermissive.types, new Set([SchemaFactory.number.identifier]));
		});
	});

	describe("getStoredSchema", () => {
		it("options", () => {
			const v1 = getStoredSchema(
				HasStagedAllowedTypes,
				restrictiveStoredSchemaGenerationOptions,
			);
			const v2 = getStoredSchema(
				HasStagedAllowedTypesAfterUpdate,
				restrictiveStoredSchemaGenerationOptions,
			);
			const v1Permissive = getStoredSchema(
				HasStagedAllowedTypes,
				permissiveStoredSchemaGenerationOptions,
			);
			assert.notDeepEqual(v1.encodeV1(), v1Permissive.encodeV1());
			assert.deepEqual(v1Permissive.encodeV1(), v2.encodeV1());
		});
	});
});
