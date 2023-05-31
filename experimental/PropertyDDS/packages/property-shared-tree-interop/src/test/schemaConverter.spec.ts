/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
	brand,
	FieldKinds,
	ValueSchema,
	fail,
	Any,
	TreeSchemaIdentifier,
	FieldSchema,
	getPrimaryField,
} from "@fluid-experimental/tree2";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { convertPropertyToSharedTreeStorageSchema } from "../schemaConverter";
import mockPropertyDDSSchemas from "./mockPropertyDDSSchemas";

// TODO: improve & enhance tests (recursive schemas, edge cases, contexts...)
describe("schema converter", () => {
	beforeAll(() => {
		PropertyFactory.register(Object.values(mockPropertyDDSSchemas));
	});

	it(`fails on a non-primitive type w/o properties and not inheriting from NodeProperty`, () => {
		assert.throws(
			() =>
				convertPropertyToSharedTreeStorageSchema(
					FieldKinds.optional,
					new Set(["Test:ErroneousType-1.0.0"]),
				),
			(e) =>
				validateAssertionError(
					e,
					`"Test:ErroneousType-1.0.0" is not primitive, contains no properties and does not inherit from "NodeProperty".`,
				),
			"Expected exception was not thrown",
		);
	});

	it(`does not support types with nested properties`, () => {
		assert.throws(
			() =>
				convertPropertyToSharedTreeStorageSchema(
					FieldKinds.optional,
					new Set(["Test:NestedProperties-1.0.0"]),
				),
			(e) =>
				validateAssertionError(
					e,
					`Nested properties are not supported yet (property "withNestedProperties" of type "Test:NestedProperties-1.0.0")`,
				),
			"Expected exception was not thrown",
		);
	});

	it(`inherits from "NodeProperty"`, () => {
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			new Set(["Test:Optional-1.0.0"]),
		);
		const nodeProperty = fullSchemaData.treeSchema.get(brand("NodeProperty"));
		const testOptional = fullSchemaData.treeSchema.get(brand("Test:Optional-1.0.0"));
		assert.deepEqual(testOptional?.extraLocalFields, nodeProperty?.extraLocalFields);
		const miscField = testOptional?.localFields.get(brand("misc"));
		assert(miscField?.types !== undefined);
		assert.deepEqual(
			[...miscField.types],
			[
				"NodeProperty",
				"NamedNodeProperty",
				"RelationshipProperty",
				"Test:Address-1.0.0",
				"Test:Optional-1.0.0",
				"Test:Person-1.0.0",
			],
		);
	});

	it(`can use "NodeProperty" as root`, () => {
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			new Set(["NodeProperty"]),
		);

		assert.deepEqual(fullSchemaData.root.kind, FieldKinds.optional);
		assert.deepEqual(
			[...(fullSchemaData.root.types ?? fail("expected root types"))],
			[
				"NodeProperty",
				"NamedNodeProperty",
				"RelationshipProperty",
				"Test:Address-1.0.0",
				"Test:Optional-1.0.0",
				"Test:Person-1.0.0",
			],
		);

		// 78 types (all types, their arrays and maps)
		assert.equal(fullSchemaData.treeSchema.size, 78);
		const nodePropertySchema =
			fullSchemaData.treeSchema.get(brand("NodeProperty")) ?? fail("expected tree schema");
		assert.deepEqual(nodePropertySchema.extraLocalFields.kind, FieldKinds.optional);
		assert.deepEqual([...nodePropertySchema.localFields], []);
		assert.deepEqual([...nodePropertySchema.globalFields], []);
		assert.equal(nodePropertySchema.extraGlobalFields, false);
		assert.equal(nodePropertySchema.value, ValueSchema.Nothing);
	});

	it("can convert property with array context", () => {
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			new Set(["Test:Person-1.0.0"]),
		);
		const addressSchema =
			fullSchemaData.treeSchema.get(brand("Test:Address-1.0.0")) ??
			fail("expected tree schema");
		const arrayField =
			(addressSchema.localFields.get(brand("phones")) as FieldSchema) ??
			fail("expected field schema");
		const arrayTypeName: TreeSchemaIdentifier = brand("array<Test:Phone-1.0.0>");
		assert.deepEqual([...(arrayField.types ?? fail("expected types"))], [arrayTypeName]);
		const arraySchema =
			fullSchemaData.treeSchema.get(arrayTypeName) ?? fail("expected tree schema");
		assert.deepEqual([...arraySchema.globalFields], []);
		assert.equal(arraySchema.extraGlobalFields, false);
		assert.equal(arraySchema.value, ValueSchema.Nothing);
		assert.equal(arraySchema.localFields.size, 1);
		const primary = getPrimaryField(arraySchema);
		assert(primary !== undefined);
		assert.deepEqual(primary.schema.kind, FieldKinds.sequence);
		assert.deepEqual(
			[...(primary.schema.types ?? fail("expected types"))],
			["Test:Phone-1.0.0"],
		);
	});

	it("can convert property with map context", () => {
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			new Set(["Test:Person-1.0.0"]),
		);
		const mapSchema =
			fullSchemaData.treeSchema.get(brand("map<String>")) ?? fail("expected tree schema");
		assert.deepEqual(mapSchema.extraLocalFields.kind, FieldKinds.optional);
		assert.deepEqual(
			[...(mapSchema.extraLocalFields.types ?? fail("expected types"))],
			["String"],
		);
		assert.deepEqual([...mapSchema.localFields], []);
		assert.deepEqual([...mapSchema.globalFields], []);
		assert.equal(mapSchema.extraGlobalFields, false);
		assert.equal(mapSchema.value, ValueSchema.Nothing);
	});

	it("can use any type as root", () => {
		{
			const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
				FieldKinds.optional,
				Any,
			);
			assert.deepEqual([...fullSchemaData.root.schema.allowedTypes], [Any]);
		}
		{
			const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
				FieldKinds.optional,
				new Set([Any]),
			);
			assert.deepEqual([...fullSchemaData.root.schema.allowedTypes], [Any]);
		}
		{
			const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
				FieldKinds.optional,
				new Set(["String", Any]),
			);
			assert.deepEqual([...fullSchemaData.root.schema.allowedTypes], [Any]);
		}
	});

	it(`can convert property w/o typeid into field of type Any`, () => {
		const extraTypeName: TreeSchemaIdentifier = brand("Test:ExtraType-1.0.0");
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			Any,
			new Set([extraTypeName]),
		);
		const extraTypeSchema =
			fullSchemaData.treeSchema.get(extraTypeName) ?? fail("expected tree schema");
		const anyField =
			(extraTypeSchema?.localFields.get(brand("any")) as FieldSchema) ??
			fail("expected field schema");
		assert.deepEqual(anyField?.kind, FieldKinds.optional);
		assert(anyField.types === undefined);
		assert.deepEqual([...anyField.allowedTypes], [Any]);
	});

	it(`can use extra schemas`, () => {
		// note: "Test:ExtraType-1.0.0" does not belong to any inheritance chain i.e.
		// it is not included into the full schema automatically
		const extraTypeName: TreeSchemaIdentifier = brand("Test:ExtraType-1.0.0");
		// provided no extra types
		{
			const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
				FieldKinds.optional,
				Any,
			);
			assert(fullSchemaData.treeSchema.get(extraTypeName) === undefined);
		}
		// with extra types
		{
			const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
				FieldKinds.optional,
				Any,
				new Set([extraTypeName]),
			);
			assert(fullSchemaData.treeSchema.get(extraTypeName) !== undefined);
		}
	});
});
