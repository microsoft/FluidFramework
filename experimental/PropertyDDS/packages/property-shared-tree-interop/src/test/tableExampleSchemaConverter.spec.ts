/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import {
	brand,
	FieldKinds,
	TreeNodeSchemaIdentifier,
	schemaIsFieldNode,
	TreeFieldSchema,
	leaf,
	ObjectNodeSchema,
	MapNodeSchema,
	FieldNodeSchema,
} from "@fluid-experimental/tree2";
import { convertPropertyToSharedTreeSchema as convertSchema } from "../schemaConverter";

const tableTypeName: TreeNodeSchemaIdentifier = brand("Test:Table-1.0.0");

function registerPropertySchemas() {
	// TODO: add support for custom field keys (that differ from the API name), then enable this case to test them.
	// PropertyFactory.register({
	// 	typeid: "Test:BannedNames",
	// 	properties: [
	// 		{ id: "value", typeid: "Uint64" },
	// 		{ id: "setValue", typeid: "Uint64" },
	// 	],
	// });

	PropertyFactory.register({
		typeid: "Test:Cell-1.0.0",
		properties: [{ id: "data", typeid: "Uint64" }],
	});

	PropertyFactory.register({
		typeid: "Test:RowProperty-1.0.0",
		properties: [{ id: "data", typeid: "String" }],
	});

	PropertyFactory.register({
		typeid: "Test:RowInfo-1.0.0",
		properties: [{ id: "data", typeid: "Uint64" }],
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
		const table = fullSchemaData.nodeSchema.get(brand(`converted.${tableTypeName}`));
		assert(table instanceof ObjectNodeSchema);
		const encoding = table.objectNodeFields.get(brand("encoding"));
		assert(encoding !== undefined);
		assert(encoding.types !== undefined);
		assert(encoding.types.has(brand("converted.Enum")));
	});

	it("Missing Refs", () => {
		const fullSchemaData = convertSchema(FieldKinds.optional, new Set([tableTypeName]));
		const typeNames = new Set(fullSchemaData.nodeSchema.keys());
		for (const typeName of typeNames) {
			const nodeSchema = fullSchemaData.nodeSchema.get(typeName);
			assert(nodeSchema !== undefined);
			if (nodeSchema instanceof ObjectNodeSchema) {
				nodeSchema.objectNodeFields.forEach((field, fieldKey) => {
					if (field.types) {
						field.types.forEach((type) => {
							assert(
								typeNames.has(type),
								`Missing type "${type}" in tree schema "${typeName}" for a local field "${fieldKey}"`,
							);
						});
					}
				});
			} else if (nodeSchema instanceof MapNodeSchema && nodeSchema.mapFields.types) {
				nodeSchema.mapFields.types.forEach((type) => {
					assert(
						typeNames.has(type),
						`Missing type "${type}" in tree schema "${typeName}" for map fields`,
					);
				});
			} else if (nodeSchema instanceof FieldNodeSchema && nodeSchema.info.types) {
				nodeSchema.info.types.forEach((type) => {
					assert(
						typeNames.has(type),
						`Missing type "${type}" in tree schema "${typeName}" for primary field`,
					);
				});
			}
		}
	});

	it("Check Structure", () => {
		const fullSchemaData = convertSchema(FieldKinds.optional, new Set([tableTypeName]));
		const table = fullSchemaData.nodeSchema.get(brand(`converted.${tableTypeName}`));
		assert(table instanceof ObjectNodeSchema);

		const extendedRows = table.objectNodeFields.get(brand("extendedRows"));
		assert(extendedRows !== undefined);
		assert(extendedRows.types !== undefined);
		assert(extendedRows.types.has(brand("converted.array<Test:ExtendedRow-1.0.0>")));

		const extendedRowsSchema = fullSchemaData.nodeSchema.get(
			brand("converted.Test:ExtendedRow-1.0.0"),
		);
		assert(extendedRowsSchema instanceof ObjectNodeSchema);
		const info = extendedRowsSchema.objectNodeFields.get(brand("info"));
		assert(info !== undefined);
		assert(info.types !== undefined);
		assert(info.types.has(brand("converted.map<Test:RowInfo-1.0.0>")));
		const infoType = fullSchemaData.nodeSchema.get(brand("converted.Test:RowInfo-1.0.0"));
		assert(infoType instanceof ObjectNodeSchema);

		const uint64 = infoType.objectNodeFields.get(brand("data"));
		assert(uint64 !== undefined);
		assert(uint64.types !== undefined);
		expect(uint64.types.has(brand("converted.Uint64"))).toBeTruthy();
		assert(uint64.types.has(brand("converted.Uint64")));
		const uint64Type =
			fullSchemaData.nodeSchema.get(brand("converted.Uint64")) ?? fail("missing schema");
		assert(schemaIsFieldNode(uint64Type));
		assert(
			uint64Type
				.getFieldSchema()
				.equals(TreeFieldSchema.create(FieldKinds.required, [leaf.number])),
		);
	});

	it("Inheritance Translation", () => {
		const fullSchemaData = convertSchema(FieldKinds.optional, new Set([tableTypeName]));
		const row = fullSchemaData.nodeSchema.get(brand("converted.array<Test:Row-1.0.0>"));
		assert(row instanceof FieldNodeSchema);
		const field = row.getFieldSchema();
		assert(field !== undefined);
		assert(field.types !== undefined);
		assert(field.types.has(brand("converted.Test:Row-1.0.0")));
		assert(field.types.has(brand("converted.Test:ExtendedRow-1.0.0")));
		assert(field.types.has(brand("converted.Test:OtherExtendedRow-1.0.0")));
	});
});
