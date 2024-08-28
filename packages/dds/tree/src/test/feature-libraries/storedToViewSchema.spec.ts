/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	EmptyKey,
	type FieldKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	ValueSchema,
	storedEmptyFieldSchema,
} from "../../core/index.js";
import {
	FieldKinds,
	FlexFieldSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	type FlexTreeNodeSchema,
	LeafNodeSchema,
	TreeNodeSchemaBase,
} from "../../feature-libraries/index.js";
import {
	fieldSchemaFromStoredSchema,
	treeSchemaFromStoredSchema,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/storedToViewSchema.js";
import { brand } from "../../util/index.js";

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
		const schemaMap = new Map<TreeNodeSchemaIdentifier, FlexTreeNodeSchema>([
			[schemaX.name, schemaX],
			[schemaY.name, schemaY],
		]);
		const roundTrip = [
			["forbidden", FlexFieldSchema.create(FieldKinds.forbidden, [])],
			["no types", FlexFieldSchema.create(FieldKinds.optional, [])],
			["one type", FlexFieldSchema.create(FieldKinds.optional, [schemaX])],
			["lazy", FlexFieldSchema.create(FieldKinds.optional, [() => schemaX])],
			["multiple types", FlexFieldSchema.create(FieldKinds.optional, [schemaX, schemaY])],
		] as const;
		for (const [name, field] of roundTrip) {
			it(name, () => {
				const converted = fieldSchemaFromStoredSchema(field.stored, schemaMap);
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
			assert(empty.rootFieldSchema.equals(FlexFieldSchema.empty));
			assert.deepEqual(empty.nodeSchema, new Map());
		});

		it("oneOfEach", () => {
			const schemaLeaf = new LeafNodeStoredSchema(ValueSchema.Number);

			const schemaObject = new ObjectNodeStoredSchema(
				new Map<FieldKey, TreeFieldStoredSchema>([
					[
						brand<FieldKey>("foo"),
						{
							kind: FieldKinds.required.identifier,
							types: new Set<TreeNodeSchemaIdentifier>([brand("leaf")]),
						} satisfies TreeFieldStoredSchema,
					],
				] satisfies [FieldKey, TreeFieldStoredSchema][]),
			);

			const schemaRecursive = new ObjectNodeStoredSchema(
				new Map<FieldKey, TreeFieldStoredSchema>([
					[
						brand<FieldKey>("foo"),
						{
							kind: FieldKinds.optional.identifier,
							types: new Set<TreeNodeSchemaIdentifier>([brand("Recursive")]),
						} satisfies TreeFieldStoredSchema,
					],
				] satisfies [FieldKey, TreeFieldStoredSchema][]),
			);

			// Current policy is to treat this case as an object.
			const schemaEmptyKey = new ObjectNodeStoredSchema(
				new Map<FieldKey, TreeFieldStoredSchema>([
					[
						EmptyKey,
						{
							kind: FieldKinds.required.identifier,
							types: new Set<TreeNodeSchemaIdentifier>([brand("leaf")]),
						} satisfies TreeFieldStoredSchema,
					],
				] satisfies [FieldKey, TreeFieldStoredSchema][]),
			);
			const schemaMap = new MapNodeStoredSchema({
				kind: FieldKinds.optional.identifier,
				types: new Set<TreeNodeSchemaIdentifier>([brand("leaf")]),
			});
			const stored = {
				rootFieldSchema: {
					kind: FieldKinds.optional.identifier,
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
				if (storedNodeSchema instanceof MapNodeStoredSchema) {
					// Since its tested separately, assume fields are converted correctly.
					assert(nodeSchema instanceof FlexMapNodeSchema);
				} else {
					assert(!(nodeSchema instanceof FlexMapNodeSchema));
				}

				assert.equal(
					(nodeSchema as Partial<LeafNodeSchema>).leafValue,
					(storedNodeSchema as Partial<LeafNodeStoredSchema>).leafValue,
				);

				if (nodeSchema instanceof FlexObjectNodeSchema) {
					assert(storedNodeSchema instanceof ObjectNodeStoredSchema);
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
