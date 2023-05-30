/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
	brand,
	FieldKinds,
	fieldSchema,
	lookupGlobalFieldSchema,
	lookupTreeSchema,
	ValueSchema,
	rootFieldKey,
	FieldStoredSchema,
	fail,
	Any,
} from "@fluid-experimental/tree2";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { convertPropertyToSharedTreeStorageSchema } from "../schemaConverter";
import personSchema from "./personPropertyDDSSchema";

// TODO: improve & enhance tests (recursive schemas, edge cases, contexts...)
describe("schema converter", () => {
	beforeAll(() => {
		PropertyFactory.register(Object.values(personSchema));
	});

	it(`fails on a non-primitive type w/o properties and not inheriting from NodeProperty`, () => {
		assert.throws(
			() =>
				convertPropertyToSharedTreeStorageSchema(
					FieldKinds.optional,
					"Test:ErroneousType-1.0.0",
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
					"Test:NestedProperties-1.0.0",
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
			"Test:Optional-1.0.0",
		);
		const nodeProperty = fullSchemaData.treeSchema.get(brand("NodeProperty"));
		const testOptional = fullSchemaData.treeSchema.get(brand("Test:Optional-1.0.0"));
		expect(testOptional?.extraLocalFields).toEqual(nodeProperty?.extraLocalFields);
		const miscField = testOptional?.localFields.get(brand("misc"));
		expect(miscField?.types?.size).toEqual(6);
		expect(miscField?.types).toContainEqual("Test:Optional-1.0.0");
		expect(miscField?.types).toContainEqual("Test:Address-1.0.0");
		expect(miscField?.types).toContainEqual("Test:Person-1.0.0");
		expect(miscField?.types).toContainEqual("NamedNodeProperty");
		expect(miscField?.types).toContainEqual("RelationshipProperty");
		expect(miscField?.types).toContainEqual("NodeProperty");
	});

	it(`can use "NodeProperty" as root`, () => {
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			"NodeProperty",
		);

		expect(fullSchemaData.globalFieldSchema.size).toEqual(1);
		const expectedRootFieldSchema = fieldSchema(FieldKinds.optional, [
			brand("NodeProperty"),
			brand("NamedNodeProperty"),
			brand("RelationshipProperty"),
			brand("Test:Address-1.0.0"),
			brand("Test:Optional-1.0.0"),
			brand("Test:Person-1.0.0"),
		]);
		expect(lookupGlobalFieldSchema(fullSchemaData, rootFieldKey)).toMatchObject(
			expectedRootFieldSchema,
		);

		// 78 types (all types, their arrays and maps)
		expect(fullSchemaData.treeSchema.size).toEqual(78);
		const nodePropertySchema = lookupTreeSchema(fullSchemaData, brand("NodeProperty"));
		expect(nodePropertySchema).toMatchObject({
			name: "NodeProperty",
			localFields: new Map(),
			extraLocalFields: { kind: FieldKinds.optional },
			globalFields: new Set(),
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		});
	});

	it("can convert property with array context", () => {
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			"Test:Person-1.0.0",
		);
		const addressSchema = lookupTreeSchema(fullSchemaData, brand("Test:Address-1.0.0"));
		expect(addressSchema).toMatchObject({
			name: "Test:Address-1.0.0",
			extraLocalFields: { kind: FieldKinds.optional },
			globalFields: new Set(),
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		});
		const expectedAddressFields = new Map<string, FieldStoredSchema>([
			["lat", fieldSchema(FieldKinds.value, [brand("Float64")])],
			["lon", fieldSchema(FieldKinds.value, [brand("Float64")])],
			["coords", fieldSchema(FieldKinds.value, [brand("array<Float64>")])],
			["zip", fieldSchema(FieldKinds.value, [brand("String")])],
			["street", fieldSchema(FieldKinds.optional, [brand("String")])],
			["city", fieldSchema(FieldKinds.optional, [brand("String")])],
			["country", fieldSchema(FieldKinds.optional, [brand("String")])],
			["phones", fieldSchema(FieldKinds.optional, [brand("array<Test:Phone-1.0.0>")])],
		]);
		for (const [fieldKey, field] of addressSchema.localFields) {
			const expected = expectedAddressFields.get(fieldKey) ?? fail("expected field");
			expect(field).toMatchObject(expected);
			expectedAddressFields.delete(fieldKey);
		}
		expect(expectedAddressFields.size).toEqual(0);
	});

	it("can use any type as root", () => {
		const fullSchemaData1 = convertPropertyToSharedTreeStorageSchema(FieldKinds.optional, Any);
		expect([...fullSchemaData1.root.schema.allowedTypes]).toMatchObject([Any]);

		const fullSchemaData2 = convertPropertyToSharedTreeStorageSchema(FieldKinds.optional);
		expect([...fullSchemaData2.root.schema.allowedTypes]).toMatchObject([Any]);

		const fullSchemaData3 = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			"String",
			Any,
		);
		expect([...fullSchemaData3.root.schema.allowedTypes]).toMatchObject([Any]);
	});
});
