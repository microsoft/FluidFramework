/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import {
	ValueSchema,
	brand,
	EmptyKey,
	lookupTreeSchema,
	FieldKinds,
	TreeSchemaIdentifier,
} from "@fluid-experimental/tree2";
import { convertPropertyToSharedTreeSchema as convertSchema } from "../schemaConverter";

const tableTypeName: TreeSchemaIdentifier = brand("Test:Table-1.0.0");

function registerPropertySchemas() {
	PropertyFactory.register({
		typeid: "Test:Cell-1.0.0",
		properties: [{ id: "value", typeid: "Uint64" }],
	});

	PropertyFactory.register({
		typeid: "Test:RowProperty-1.0.0",
		properties: [{ id: "value", typeid: "String" }],
	});

	PropertyFactory.register({
		typeid: "Test:RowInfo-1.0.0",
		properties: [{ id: "value", typeid: "Uint64" }],
	});

	PropertyFactory.register({
		typeid: "Test:Row-1.0.0",
		properties: [{ id: "cells", typeid: "Test:Cell-1.0.0", context: "array" }],
	});

	PropertyFactory.register({
		typeid: "Test:ExtendedRow-1.0.0",
		inherits: ["Test:Row-1.0.0"],
		properties: [
			{ id: "info", typeid: "Test:RowInfo-1.0.0", context: "map" },
			{ id: "props", typeid: "Test:RowProperty-1.0.0", context: "map" },
		],
	});

	PropertyFactory.register({
		typeid: "Test:OtherExtendedRow-1.0.0",
		inherits: ["Test:Row-1.0.0"],
		properties: [
			{ id: "info", typeid: "Test:RowInfo-1.0.0", context: "map" },
			{ id: "props", typeid: "Test:RowProperty-1.0.0", context: "map" },
		],
	});

	PropertyFactory.register({
		typeid: "Test:Table-1.0.0",
		properties: [
			{ id: "rows", typeid: "Test:Row-1.0.0", context: "array" },
			{ id: "extendedRows", typeid: "Test:ExtendedRow-1.0.0", context: "array" },
			{
				id: "encoding",
				typeid: "Enum",
				properties: [
					{
						id: "none",
						value: 1,
					},
					{
						id: "utf8",
						value: 2,
					},
					{
						id: "base64",
						value: 3,
					},
				],
			},
		],
	});

	PropertyFactory.register({
		typeid: "Test:DescribedTable-1.0.0",
		inherits: ["Test:Table-1.0.0"],
		properties: [{ id: "description", typeid: "String" }],
	});
}

describe("LlsSchemaConverter", () => {
	beforeAll(registerPropertySchemas);

	it("Enum", () => {
		const fullSchemaData = convertSchema(FieldKinds.optional, new Set([tableTypeName]));
		const table = lookupTreeSchema(fullSchemaData, tableTypeName);
		assert(table !== undefined);
		const encoding = table.localFields.get(brand("encoding"));
		assert(encoding !== undefined);
		assert(encoding.types !== undefined);
		assert(encoding.types.has(brand("Enum")));
	});

	it("Missing Refs", () => {
		const fullSchemaData = convertSchema(FieldKinds.optional, new Set([tableTypeName]));
		const typeNames = new Set(fullSchemaData.treeSchema.keys());
		for (const typeName of typeNames) {
			const treeSchema = lookupTreeSchema(fullSchemaData, typeName);
			assert(treeSchema !== undefined);
			treeSchema.localFields.forEach((field, fieldKey) => {
				if (field.types) {
					field.types.forEach((type) => {
						assert(
							typeNames.has(type),
							`Missing type "${type}" in tree schema "${typeName}" for a local field "${fieldKey}"`,
						);
					});
				}
			});
			if (treeSchema.extraLocalFields.types) {
				treeSchema.extraLocalFields.types.forEach((type) => {
					assert(
						typeNames.has(type),
						`Missing type "${type}" in tree schema "${typeName}" for extra local fields`,
					);
				});
			}
		}
	});

	it("Check Structure", () => {
		const fullSchemaData = convertSchema(FieldKinds.optional, new Set([tableTypeName]));
		const table = lookupTreeSchema(fullSchemaData, tableTypeName);
		assert(table !== undefined);
		assert(table.localFields !== undefined);

		const extendedRows = table.localFields.get(brand("extendedRows"));
		assert(extendedRows !== undefined);
		assert(extendedRows.types !== undefined);
		assert(extendedRows.types.has(brand("array<Test:ExtendedRow-1.0.0>")));

		const extendedRowsSchema = lookupTreeSchema(
			fullSchemaData,
			brand("Test:ExtendedRow-1.0.0"),
		);
		assert(extendedRowsSchema !== undefined);
		const info = extendedRowsSchema.localFields.get(brand("info"));
		assert(info !== undefined);
		assert(info.types !== undefined);
		assert(info.types.has(brand("map<Test:RowInfo-1.0.0>")));
		const infoType = lookupTreeSchema(fullSchemaData, brand("Test:RowInfo-1.0.0"));
		assert(infoType !== undefined);

		const uint64 = infoType.localFields.get(brand("value"));
		assert(uint64 !== undefined);
		assert(uint64.types !== undefined);
		expect(uint64.types.has(brand("Uint64"))).toBeTruthy();
		assert(uint64.types.has(brand("Uint64")));
		const uint64Type = lookupTreeSchema(fullSchemaData, brand("Uint64"));
		assert(uint64Type.value === ValueSchema.Number);
	});

	it("Inheritance Translation", () => {
		const fullSchemaData = convertSchema(FieldKinds.optional, new Set([tableTypeName]));
		const row = lookupTreeSchema(fullSchemaData, brand("array<Test:Row-1.0.0>"));
		assert(row !== undefined);
		assert(row.localFields !== undefined);
		const field = row.localFields.get(EmptyKey);
		assert(field !== undefined);
		assert(field.types !== undefined);
		assert(field.types.has(brand("Test:Row-1.0.0")));
		assert(field.types.has(brand("Test:ExtendedRow-1.0.0")));
		assert(field.types.has(brand("Test:OtherExtendedRow-1.0.0")));
	});
});
