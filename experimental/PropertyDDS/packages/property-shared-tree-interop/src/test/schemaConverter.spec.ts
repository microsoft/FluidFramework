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
} from "@fluid-internal/tree";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { convertPropertyToSharedTreeStorageSchema } from "../schemaConverter";
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
});
