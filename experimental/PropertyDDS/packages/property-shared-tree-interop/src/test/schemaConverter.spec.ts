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
	TreeSchemaIdentifier,
	EmptyKey,
	FieldStoredSchema,
	fail,
} from "@fluid-experimental/tree2";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import {
	addComplexTypeToSchema,
	convertPropertyToSharedTreeStorageSchema,
} from "../schemaConverter";
import personSchema from "./personSchema";

// TODO: test recursive schemas
describe("schema converter", () => {
	beforeAll(() => {
		PropertyFactory.register(Object.values(personSchema));
	});

	it(`inherits from "NodeProperty"`, () => {
		assert.throws(
			() =>
				convertPropertyToSharedTreeStorageSchema(
					FieldKinds.optional,
					"Test:ErroneousType-1.0.0",
				),
			(e) =>
				validateAssertionError(
					e,
					`"Test:ErroneousType-1.0.0" contains no properties and does not inherit from "NodeProperty".`,
				),
			"Expected exception was not thrown",
		);
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			"Test:Optional-1.0.0",
		);
		const nodeProperty = fullSchemaData.treeSchema.get(brand("NodeProperty"));
		assert(nodeProperty);
		const testOptional = fullSchemaData.treeSchema.get(brand("Test:Optional-1.0.0"));
		assert(testOptional);
		assert.deepEqual(testOptional.extraLocalFields, nodeProperty.extraLocalFields);
		const miscField = testOptional.localFields.get(brand("misc"));
		assert(miscField);
		assert(miscField.types?.has(brand("Test:Optional-1.0.0")));
		assert(miscField.types?.has(brand("NamedNodeProperty")));
		assert(miscField.types?.has(brand("RelationshipProperty")));
		assert(miscField.types?.has(brand("NodeProperty")));
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

		// 62 types (primitives + "NodeProperty" including inheritances, their arrays and maps)
		expect(fullSchemaData.treeSchema.size).toEqual(62);
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
		}
	});

	it("can dynamically create collection types", () => {
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(
			FieldKinds.optional,
			"Test:Person-1.0.0",
		);

		const geoLocationTypeName: TreeSchemaIdentifier = brand("Test:GeodesicLocation-1.0.0");
		const schemaWithNewArray = addComplexTypeToSchema(
			fullSchemaData,
			"array",
			geoLocationTypeName,
		);
		const arrayTypeName: TreeSchemaIdentifier = brand(`array<${geoLocationTypeName}>`);
		const geoLocationArraySchema = lookupTreeSchema(schemaWithNewArray, arrayTypeName);
		expect(geoLocationArraySchema).toMatchObject({
			name: arrayTypeName,
			localFields: new Map([
				[
					EmptyKey,
					fieldSchema(FieldKinds.sequence, [
						geoLocationTypeName,
						brand("Test:Address-1.0.0"),
					]),
				],
			]),
			extraLocalFields: new Map(),
			globalFields: new Set(),
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		});

		const schemaWithNewMap = addComplexTypeToSchema(fullSchemaData, "map", geoLocationTypeName);
		const mapTypeName: TreeSchemaIdentifier = brand(`map<${geoLocationTypeName}>`);
		const geoLocationMapSchema = lookupTreeSchema(schemaWithNewMap, mapTypeName);
		expect(geoLocationMapSchema).toMatchObject({
			name: mapTypeName,
			localFields: new Map(),
			extraLocalFields: fieldSchema(FieldKinds.optional, [
				geoLocationTypeName,
				brand("Test:Address-1.0.0"),
			]),
			globalFields: new Set(),
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		});

		assert.throws(
			() => addComplexTypeToSchema(fullSchemaData, "tuple", geoLocationTypeName),
			(e) => validateAssertionError(e, `Not supported collection context "tuple"`),
			"Expected exception was not thrown",
		);
	});
});
