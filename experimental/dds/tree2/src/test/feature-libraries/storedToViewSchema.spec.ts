/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	EmptyKey,
	TreeNodeSchemaIdentifier,
	TreeNodeStoredSchema,
	ValueSchema,
	storedEmptyFieldSchema,
} from "../../core";
import { Any, FieldKinds, TreeFieldSchema, TreeNodeSchema } from "../../feature-libraries";
import {
	fieldSchemaFromStoredSchema,
	treeSchemaFromStoredSchema,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/storedToViewSchema";

describe("storedToViewSchema", () => {
	describe("fieldSchemaFromStoredSchema", () => {
		const schemaX = new TreeNodeSchema({ name: "z" }, "x", { leafValue: ValueSchema.Number });
		const schemaY = new TreeNodeSchema({ name: "z" }, "y", { leafValue: ValueSchema.Number });
		const schemaMap = new Map([[schemaX.name, schemaX]]);
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
			const schemaLeaf = new TreeNodeSchema({ name: "z" }, "leaf", {
				leafValue: ValueSchema.Number,
			});
			const schemaObject = new TreeNodeSchema({ name: "z" }, "object", {
				objectNodeFields: {
					foo: {
						kind: { identifier: FieldKinds.required.identifier },
						types: new Set(["leaf"]),
					},
				},
			});
			const schemaRecursive = new TreeNodeSchema({ name: "z" }, "Recursive", {
				objectNodeFields: {
					foo: {
						kind: { identifier: FieldKinds.sequence.identifier },
						types: new Set(["Recursive"]),
					},
				},
			});
			// Current policy is to treat this case as an object.
			const schemaEmptyKey = new TreeNodeSchema({ name: "z" }, "EmptyKey", {
				objectNodeFields: {
					[EmptyKey]: {
						kind: { identifier: FieldKinds.required.identifier },
						types: new Set(["leaf"]),
					},
				},
			});
			const schemaMap = new TreeNodeSchema({ name: "z" }, "map", {
				mapFields: {
					kind: { identifier: FieldKinds.optional.identifier },
					types: new Set(["leaf"]),
				},
			});
			const stored = {
				rootFieldSchema: {
					kind: { identifier: FieldKinds.optional.identifier },
					types: new Set([schemaMap.name, schemaObject.name]),
				},
				nodeSchema: new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
					[schemaMap.name, schemaMap],
					[schemaEmptyKey.name, schemaEmptyKey],
					[schemaRecursive.name, schemaRecursive],
					[schemaObject.name, schemaObject],
					[schemaLeaf.name, schemaLeaf],
				]),
			};
			const viewSchema = treeSchemaFromStoredSchema(stored);
			assert.deepEqual(viewSchema.rootFieldSchema.types, stored.rootFieldSchema.types);
			assert.deepEqual(viewSchema.nodeSchema.size, stored.nodeSchema.size);
			for (const [key, nodeSchema] of viewSchema.nodeSchema) {
				const storedNodeSchema = stored.nodeSchema.get(key) ?? assert.fail();
				assert(nodeSchema instanceof TreeNodeSchema);
				assert.equal(nodeSchema.name, key);
				if (storedNodeSchema.mapFields !== undefined) {
					// Since its tested separately, assume fields are converted correctly.
					assert(nodeSchema.mapFields !== undefined);
				} else {
					assert(nodeSchema.mapFields === undefined);
				}

				assert.equal(nodeSchema.leafValue, storedNodeSchema.leafValue);

				assert.equal(
					storedNodeSchema.objectNodeFields.size,
					nodeSchema.objectNodeFields.size,
				);

				// Since its tested separately, assume fields are converted correctly, and just compare keys to make sure all fields were converted.
				assert.deepEqual(
					new Set(storedNodeSchema.objectNodeFields.keys()),
					new Set(nodeSchema.objectNodeFields.keys()),
				);
			}
		});
	});
});
