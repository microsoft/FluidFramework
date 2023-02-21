/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	brand,
	FieldKinds,
	createSchemaRepository,
	fieldSchema,
	lookupGlobalFieldSchema,
	lookupTreeSchema,
	ValueSchema,
	rootFieldKey,
} from "@fluid-internal/tree";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { convertPSetSchemaToSharedTreeLls } from "../schemaConverter";
import personSchema from "./personSchema";

describe("schema converter", () => {
	beforeAll(() => {
		PropertyFactory.register(Object.values(personSchema));
	});

	it(`can use "NodeProperty" as root`, () => {
		const rootFieldSchema = fieldSchema(FieldKinds.optional, [
			brand("NodeProperty"),
			brand("NamedNodeProperty"),
			brand("RelationshipProperty"),
			brand("Test:Address-1.0.0"),
			brand("Test:Person-1.0.0"),
		]);
		const schemaRepository = createSchemaRepository();
		convertPSetSchemaToSharedTreeLls(schemaRepository, rootFieldSchema);

		// 12 basic types + NodeProperty
		expect(schemaRepository.globalFieldSchema.size).toEqual(1);
		expect(lookupGlobalFieldSchema(schemaRepository, rootFieldKey)).toEqual(rootFieldSchema);

		expect(schemaRepository.treeSchema.size).toEqual(31);
		const nodePropertySchema = lookupTreeSchema(schemaRepository, brand("NodeProperty"));
		expect(nodePropertySchema).toEqual({
			name: "NodeProperty",
			localFields: new Map(),
			extraLocalFields: { kind: "Optional" },
			globalFields: new Set(),
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		});
	});

	it("can convert property with array context", () => {
		const rootFieldSchema = fieldSchema(FieldKinds.optional, [brand("Test:Person-1.0.0")]);
		const schemaRepository = createSchemaRepository();
		convertPSetSchemaToSharedTreeLls(schemaRepository, rootFieldSchema);
		const addressSchema = lookupTreeSchema(schemaRepository, brand("Test:Address-1.0.0"));
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
			extraLocalFields: { kind: "Optional" },
			globalFields: new Set(),
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		});
	});
});
