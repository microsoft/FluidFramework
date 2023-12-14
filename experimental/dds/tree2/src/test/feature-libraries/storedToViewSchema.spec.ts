/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	EmptyKey,
	FieldKey,
	TreeFieldStoredSchema,
	TreeNodeSchemaIdentifier,
	TreeNodeStoredSchema,
	ValueSchema,
	storedEmptyFieldSchema,
} from "../../core";
import {
	Any,
	FieldKinds,
	LeafNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	TreeFieldSchema,
	TreeNodeSchema,
	TreeNodeSchemaBase,
} from "../../feature-libraries";
import {
	fieldSchemaFromStoredSchema,
	treeSchemaFromStoredSchema,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/storedToViewSchema";
import { brand } from "../../util";

describe("storedToViewSchema", () => {
	describe("fieldSchemaFromStoredSchema", () => {
		const schemaX = LeafNodeSchema.create(
			{ name: "z" },
			brand<TreeNodeSchemaIdentifier>("x"),
			ValueSchema.Number,
		);
		const schemaY = LeafNodeSchema.create(
			{ name: "z" },
			brand<TreeNodeSchemaIdentifier>("y"),
			ValueSchema.Number,
		);
		const schemaMap = new Map<TreeNodeSchemaIdentifier, TreeNodeSchema>([
			[schemaX.name, schemaX],
			[schemaY.name, schemaY],
		]);
		const roundTrip = [
			["any", TreeFieldSchema.create(FieldKinds.optional, [Any])],
			["forbidden", TreeFieldSchema.create(FieldKinds.forbidden, [Any])],
			["no types", TreeFieldSchema.create(FieldKinds.optional, [])],
			["one type", TreeFieldSchema.create(FieldKinds.optional, [schemaX])],
			["lazy", TreeFieldSchema.create(FieldKinds.optional, [() => schemaX])],
			["multiple types", TreeFieldSchema.create(FieldKinds.optional, [schemaX, schemaY])],
		] as const;
		for (const [name, field] of roundTrip) {
			it(name, () => {
				const converted = fieldSchemaFromStoredSchema(field, schemaMap);
				assert(converted.equals(field));
			});
		}
	});

	describe("treeSchemaFromStoredSchema", () => {
		it("empty", () => {
			const empty = treeSchemaFromStoredSchema({
				rootFieldSchema: storedEmptyFieldSchema,
				nodeSchema: new Map(),
			});
			assert(empty.rootFieldSchema.equals(TreeFieldSchema.empty));
			assert.deepEqual(empty.nodeSchema, new Map());
		});

		it("oneOfEach", () => {
			const schemaLeaf: TreeNodeStoredSchema = {
				leafValue: ValueSchema.Number,
				objectNodeFields: new Map(),
			};

			const schemaObject: TreeNodeStoredSchema = {
				objectNodeFields: new Map<FieldKey, TreeFieldStoredSchema>([
					[
						brand<FieldKey>("foo"),
						{
							kind: { identifier: FieldKinds.required.identifier },
							types: new Set<TreeNodeSchemaIdentifier>([brand("leaf")]),
						} satisfies TreeFieldStoredSchema,
					],
				] satisfies [FieldKey, TreeFieldStoredSchema][]),
			};

			const schemaRecursive: TreeNodeStoredSchema = {
				objectNodeFields: new Map<FieldKey, TreeFieldStoredSchema>([
					[
						brand<FieldKey>("foo"),
						{
							kind: { identifier: FieldKinds.optional.identifier },
							types: new Set<TreeNodeSchemaIdentifier>([brand("Recursive")]),
						} satisfies TreeFieldStoredSchema,
					],
				] satisfies [FieldKey, TreeFieldStoredSchema][]),
			};

			// Current policy is to treat this case as an object.
			const schemaEmptyKey: TreeNodeStoredSchema = {
				objectNodeFields: new Map<FieldKey, TreeFieldStoredSchema>([
					[
						EmptyKey,
						{
							kind: { identifier: FieldKinds.required.identifier },
							types: new Set<TreeNodeSchemaIdentifier>([brand("leaf")]),
						} satisfies TreeFieldStoredSchema,
					],
				] satisfies [FieldKey, TreeFieldStoredSchema][]),
			};
			const schemaMap: TreeNodeStoredSchema = {
				objectNodeFields: new Map(),
				mapFields: {
					kind: { identifier: FieldKinds.optional.identifier },
					types: new Set<TreeNodeSchemaIdentifier>([brand("leaf")]),
				},
			};
			const stored = {
				rootFieldSchema: {
					kind: { identifier: FieldKinds.optional.identifier },
					types: new Set<TreeNodeSchemaIdentifier>([brand("map"), brand("object")]),
				},
				nodeSchema: new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
					[brand("map"), schemaMap],
					[brand("EmptyKey"), schemaEmptyKey],
					[brand("Recursive"), schemaRecursive],
					[brand("object"), schemaObject],
					[brand("leaf"), schemaLeaf],
				]),
			};
			const viewSchema = treeSchemaFromStoredSchema(stored);
			assert.deepEqual(viewSchema.rootFieldSchema.types, stored.rootFieldSchema.types);
			assert.deepEqual(viewSchema.nodeSchema.size, stored.nodeSchema.size);
			for (const [key, nodeSchema] of viewSchema.nodeSchema) {
				const storedNodeSchema = stored.nodeSchema.get(key) ?? assert.fail();
				assert(nodeSchema instanceof TreeNodeSchemaBase);
				assert.equal(nodeSchema.name, key);
				if (storedNodeSchema.mapFields !== undefined) {
					// Since its tested separately, assume fields are converted correctly.
					assert(nodeSchema instanceof MapNodeSchema);
				} else {
					assert(!(nodeSchema instanceof MapNodeSchema));
				}

				assert.equal(
					(nodeSchema as Partial<LeafNodeSchema>).leafValue,
					storedNodeSchema.leafValue,
				);

				if (nodeSchema instanceof ObjectNodeSchema) {
					assert.equal(
						storedNodeSchema.objectNodeFields.size,
						nodeSchema.objectNodeFields.size,
					);

					// Since it's tested separately, assume fields are converted correctly, and just compare keys to make sure all fields were converted.
					assert.deepEqual(
						new Set(storedNodeSchema.objectNodeFields.keys()),
						new Set(nodeSchema.objectNodeFields.keys()),
					);
				}
			}
		});
	});
});
