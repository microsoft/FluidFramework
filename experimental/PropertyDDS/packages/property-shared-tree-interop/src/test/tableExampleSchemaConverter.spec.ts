/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import {
	createSchemaRepository,
	defaultSchemaPolicy,
	FieldSchema,
	ValueSchema,
	brand,
	EmptyKey,
	lookupTreeSchema,
} from "@fluid-internal/tree";
import { convertPSetSchemaToSharedTreeLls } from "../schemaConverter";

describe("LlsSchemaConverter", () => {
	let schemaRepository;
	beforeAll(() => {
		register();
		const tableSdc: any = brand("Test:Table-1.0.0");
		const [, OptionalFieldKind] = defaultSchemaPolicy.fieldKinds.keys();

		function getRootFieldSchema(): FieldSchema {
			return {
				kind: OptionalFieldKind,
				types: new Set([tableSdc]),
			};
		}
		const rootFieldSchema: FieldSchema = getRootFieldSchema();
		schemaRepository = createSchemaRepository();
		convertPSetSchemaToSharedTreeLls(schemaRepository, rootFieldSchema);
	});
	it("Enum", () => {
		checkEnum(schemaRepository);
	});
	it("Missing Refs", () => {
		checkMissingRefs(schemaRepository);
	});
	it("Check Structure", () => {
		checkStructure(schemaRepository);
	});
	it("Inheritance Translation", () => {
		checkInheritanceTranslation(schemaRepository);
	});
});

function register() {
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

function checkMissingRefs(schemaData) {
	const schemaMap = schemaData.treeSchema;
	const schemaTypesSet = new Set<string>();
	let keysIter = schemaMap.keys();
	for (const key of keysIter) {
		schemaTypesSet.add(key);
	}
	keysIter = schemaMap.keys();
	for (const key of keysIter) {
		const value = schemaMap.get(key);
		value?.localFields.forEach((field) => {
			if (field.types) {
				field.types.forEach((type) => {
					if (!schemaTypesSet.has(type.toString())) {
						fail(
							`Missing type ${type.toString()} in schema at the type ${key} field ${
								field.name
							}`,
						);
					}
				});
			}
		});
	}
}

function checkInheritanceTranslation(schemaData) {
	const row = lookupTreeSchema(schemaData, brand("array<Test:Row-1.0.0>"));
	assert(row !== undefined);
	assert(row.localFields !== undefined);
	const field = row.localFields.get(EmptyKey);
	assert(field !== undefined);
	assert(field.types !== undefined);
	const types = field.types;
	expect(types.has(brand("Test:Row-1.0.0"))).toBeTruthy();
	expect(types.has(brand("Test:ExtendedRow-1.0.0"))).toBeTruthy();
	expect(types.has(brand("Test:OtherExtendedRow-1.0.0"))).toBeTruthy();
}

function checkEnum(schemaData) {
	const schemaMap = schemaData.treeSchema;
	const table = schemaMap.get("Test:Table-1.0.0");
	expect(table).not.toBeUndefined();
	expect(table?.localFields).not.toBeUndefined();
	const encoding = table?.localFields.get("encoding");
	expect(encoding).not.toBeUndefined();
	expect(encoding?.types).not.toBeUndefined();
	expect(encoding?.types?.has("Enum")).toBeTruthy();
}

function checkStructure(schemaData) {
	const schemaMap = schemaData.treeSchema;
	const table = schemaMap.get("Test:Table-1.0.0");
	checkTable(schemaData, table);
}

function checkTable(schemaData, table) {
	expect(table).not.toBeUndefined();
	expect(table?.localFields).not.toBeUndefined();
	const extendedRows = table?.localFields.get("extendedRows");
	checkExtendedRows(schemaData, extendedRows);
}

function checkExtendedRows(schemaData, extendedRows) {
	expect(extendedRows).not.toBeUndefined();
	expect(extendedRows?.types).not.toBeUndefined();
	expect(extendedRows?.types?.has("array<Test:ExtendedRow-1.0.0>")).toBeTruthy();
	const info = schemaData.treeSchema.get("Test:ExtendedRow-1.0.0")?.localFields.get("info");
	checkInfo(schemaData, info);
}

function checkInfo(schemaData, info) {
	expect(info).not.toBeUndefined();
	expect(info?.types).not.toBeUndefined();
	expect(info?.types?.has("map<Test:RowInfo-1.0.0>")).toBeTruthy();
	const infoType = schemaData.treeSchema.get("Test:RowInfo-1.0.0");
	expect(infoType).not.toBeUndefined();
	expect(infoType?.localFields).not.toBeUndefined();
	const uint64 = schemaData.treeSchema.get("Test:RowInfo-1.0.0");
	checkUint64(schemaData, uint64);
}

function checkUint64(schemaData, uint64) {
	expect(uint64).not.toBeUndefined();
	const uint64Type = schemaData.treeSchema.get("Uint64");
	expect(uint64Type.value === ValueSchema.Number).toBeTruthy();
}
