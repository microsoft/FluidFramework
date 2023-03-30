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
} from "@fluid-internal/tree";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import {
	addComplexTypeToSchema,
	convertPropertyToSharedTreeStorageSchema,
} from "../schemaConverter";
import personSchema from "./personSchema";

describe("schema converter", () => {
	beforeAll(() => {
		PropertyFactory.register(Object.values(personSchema));
	});

	it(`inherits from "NodeProperty"`, () => {
		assert.throws(
			() =>
				convertPropertyToSharedTreeStorageSchema(
					fieldSchema(FieldKinds.optional, [brand("Test:ErroneousType-1.0.0")]),
				),
			(e) =>
				validateAssertionError(
					e,
					`"Test:ErroneousType-1.0.0" contains no properties and does not inherit from "NodeProperty".`,
				),
			"Expected exception was not thrown",
		);
		const rootFieldSchema = fieldSchema(FieldKinds.optional, [brand("Test:Optional-1.0.0")]);
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(rootFieldSchema);
		expect(lookupGlobalFieldSchema(fullSchemaData, rootFieldKey)).toEqual(rootFieldSchema);
	});

	it(`can use "NodeProperty" as root`, () => {
		const rootFieldSchema = fieldSchema(FieldKinds.optional, [brand("NodeProperty")]);
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(rootFieldSchema);

		expect(fullSchemaData.globalFieldSchema.size).toEqual(1);
		const expectedRootFieldSchema = fieldSchema(FieldKinds.optional, [
			brand("NodeProperty"),
			brand("NamedNodeProperty"),
			brand("RelationshipProperty"),
			brand("Test:Address-1.0.0"),
			brand("Test:Optional-1.0.0"),
			brand("Test:Person-1.0.0"),
		]);
		expect(lookupGlobalFieldSchema(fullSchemaData, rootFieldKey)).toEqual(
			expectedRootFieldSchema,
		);

		// 62 types (primitives + "NodeProperty" including inheritances, their arrays and maps)
		expect(fullSchemaData.treeSchema.size).toEqual(62);
		const nodePropertySchema = lookupTreeSchema(fullSchemaData, brand("NodeProperty"));
		expect(nodePropertySchema).toEqual({
			name: "NodeProperty",
			localFields: new Map(),
			extraLocalFields: { kind: FieldKinds.optional },
			globalFields: new Set(),
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		});
	});

	it("can convert property with array context", () => {
		const rootFieldSchema = fieldSchema(FieldKinds.optional, [brand("Test:Person-1.0.0")]);
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(rootFieldSchema);
		const addressSchema = lookupTreeSchema(fullSchemaData, brand("Test:Address-1.0.0"));
		expect(addressSchema).toMatchObject({
			name: "Test:Address-1.0.0",
			localFields: new Map([
				["lat", fieldSchema(FieldKinds.value, [brand("Float64")])],
				["lon", fieldSchema(FieldKinds.value, [brand("Float64")])],
				["coords", fieldSchema(FieldKinds.value, [brand("array<Float64>")])],
				["zip", fieldSchema(FieldKinds.value, [brand("String")])],
				["street", fieldSchema(FieldKinds.optional, [brand("String")])],
				["city", fieldSchema(FieldKinds.optional, [brand("String")])],
				["country", fieldSchema(FieldKinds.optional, [brand("String")])],
				["phones", fieldSchema(FieldKinds.optional, [brand("array<Test:Phone-1.0.0>")])],
			]),
			extraLocalFields: { kind: FieldKinds.optional },
			globalFields: new Set(),
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		});
	});

	it("can dynamically create collection types", () => {
		const rootFieldSchema = fieldSchema(FieldKinds.optional, [brand("Test:Person-1.0.0")]);
		const fullSchemaData = convertPropertyToSharedTreeStorageSchema(rootFieldSchema);

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
