/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import {
	FieldKinds,
	Multiplicity,
	getPrimaryField,
	getFieldKind,
	getFieldSchema,
	SchemaBuilder,
	TreeStatus,
} from "../../../feature-libraries";
import {
	FieldKey,
	FieldStoredSchema,
	EmptyKey,
	AnchorSet,
	rootFieldKey,
	keyAsDetachedField,
	applyDelta,
} from "../../../core";
import {
	isPrimitive,
	getOwnArrayKeys,
	keyIsValidIndex,
	treeStatusFromAnchorCache,
	detachedFieldSlot,
	treeStatusFromDetachedField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree/utilities";
import { brand } from "../../../util";
import {
	arraySchema,
	buildTestSchema,
	int32Schema,
	mapStringSchema,
	optionalChildSchema,
	stringSchema,
} from "./mockData";

describe("editable-tree utilities", () => {
	it("isPrimitive", () => {
		assert(isPrimitive(int32Schema));
		assert(isPrimitive(stringSchema));
		assert(!isPrimitive(mapStringSchema));
		assert(!isPrimitive(optionalChildSchema));
	});

	it("field utils", () => {
		const schema =
			arraySchema.structFields.get(EmptyKey) ?? fail("Expected primary array field");
		const expectedPrimary: { key: FieldKey; schema: FieldStoredSchema } = {
			key: EmptyKey,
			schema,
		};

		const rootSchema = SchemaBuilder.field(FieldKinds.value, arraySchema);
		const fullSchemaData = buildTestSchema(rootSchema);
		const primary = getPrimaryField(arraySchema);
		assert(primary !== undefined);
		assert.deepEqual(getFieldSchema(primary.key, arraySchema), schema);
		assert.equal(
			getFieldKind(getFieldSchema(primary.key, arraySchema)).multiplicity,
			Multiplicity.Sequence,
		);
		assert.deepEqual(primary, expectedPrimary);
		assert(getPrimaryField(optionalChildSchema) === undefined);
		assert(getPrimaryField(mapStringSchema) === undefined);
	});

	it("get array-like keys", () => {
		assert.deepEqual(getOwnArrayKeys(1), Object.getOwnPropertyNames([""]));
		assert.deepEqual(getOwnArrayKeys(0), Object.getOwnPropertyNames([]));
		assert.deepEqual(getOwnArrayKeys(1), [...Object.keys([""]), "length"]);
		assert.deepEqual(getOwnArrayKeys(0), [...Object.keys([]), "length"]);
	});

	it("key is a valid array index", () => {
		assert.equal(keyIsValidIndex(0, 1), true);
		assert.equal(keyIsValidIndex(0, 0), false);
		assert.equal(keyIsValidIndex("0", 1), true);
		assert.equal(keyIsValidIndex("0", 0), false);
		assert.equal(keyIsValidIndex("0.0", 1), false);
		assert.equal(keyIsValidIndex(-1, 2), false);
		assert.equal(keyIsValidIndex("-1", 2), false);
		assert.equal(keyIsValidIndex("-1.5", 2), false);
		assert.equal(keyIsValidIndex("1.5", 2), false);
		assert.equal(keyIsValidIndex("1.x", 2), false);
		assert.equal(keyIsValidIndex("-1.x", 2), false);
		assert.equal(keyIsValidIndex(NaN, 1), false);
		assert.equal(keyIsValidIndex(Infinity, 1), false);
		assert.equal(keyIsValidIndex("NaN", 1), false);
		assert.equal(keyIsValidIndex("Infinity", 1), false);
	});

	describe("treeStatusFromAnchorCache", () => {
		it("root detachedField returns TreeStatus.InDocument", () => {
			const anchors = new AnchorSet();
			assert(anchors.generationNumber === 0);
			const anchor0 = anchors.track({
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			});
			const anchorNode0 = anchors.locate(anchor0);
			assert(anchorNode0 !== undefined);

			// Checks that treeStatusFromAnchorCache returns the correct TreeStatus.
			assert(treeStatusFromAnchorCache(anchors, anchorNode0) === TreeStatus.InDocument);
		});

		it("non-root detachedField returns TreeStatus.Removed", () => {
			const anchors = new AnchorSet();
			assert(anchors.generationNumber === 0);
			const testFieldKey: FieldKey = brand("testFieldKey");
			const anchor0 = anchors.track({
				parent: undefined,
				parentField: testFieldKey,
				parentIndex: 0,
			});
			const anchorNode0 = anchors.locate(anchor0);
			assert(anchorNode0 !== undefined);

			// Checks that treeStatusFromAnchorCache returns the correct TreeStatus.
			assert(treeStatusFromAnchorCache(anchors, anchorNode0) === TreeStatus.Removed);
		});

		it("uses cached field only when cache is not stale", () => {
			const anchors = new AnchorSet();
			assert(anchors.generationNumber === 0);
			const anchor0 = anchors.track({
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			});
			const anchorNode0 = anchors.locate(anchor0);
			assert(anchorNode0 !== undefined);

			// Checks that treeStatus is TreeStatus.InDocument
			assert(treeStatusFromAnchorCache(anchors, anchorNode0) === TreeStatus.InDocument);

			// Manually set cache to a non-root detachedField to check if it's being used.
			const testFieldKey: FieldKey = brand("testFieldKey");
			anchorNode0.slots.set(detachedFieldSlot, {
				generationNumber: 0,
				detachedField: keyAsDetachedField(testFieldKey),
			});
			assert(treeStatusFromAnchorCache(anchors, anchorNode0) === TreeStatus.Removed);

			// Applies a dummy delta to increment anchorSet generationNumber.
			applyDelta(new Map([]), anchors);
			// Checks that the treeStatus is no longer being read from stale cache.
			assert(treeStatusFromAnchorCache(anchors, anchorNode0) === TreeStatus.InDocument);
		});

		it("correctly sets and updates cache", () => {
			const anchors = new AnchorSet();
			assert(anchors.generationNumber === 0);
			const anchor0 = anchors.track({
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			});
			const anchorNode0 = anchors.locate(anchor0);
			assert(anchorNode0 !== undefined);

			// Checks that the initial cache is undefined.
			assert(anchorNode0.slots.get(detachedFieldSlot) === undefined);

			const expectedCache = {
				generationNumber: 0,
				detachedField: keyAsDetachedField(rootFieldKey),
			};

			// Checks that the cache is updated to the expected value after calling treeStatusFromAnchorCache.
			treeStatusFromAnchorCache(anchors, anchorNode0);
			assert.deepEqual(anchorNode0.slots.get(detachedFieldSlot), expectedCache);

			// Applies a dummy delta to increment anchorSet generationNumber.
			applyDelta(new Map([]), anchors);

			// Checks that the cache generationNumber is mismatched with anchorSet generationNumber.
			assert.notEqual(
				anchorNode0.slots.get(detachedFieldSlot)?.generationNumber,
				anchors.generationNumber,
			);

			const expectedUpdatedCache = {
				generationNumber: 1,
				detachedField: keyAsDetachedField(rootFieldKey),
			};
			// Calls treeStatusFromAnchorCache and checks if cache is updated.
			treeStatusFromAnchorCache(anchors, anchorNode0);
			assert.deepEqual(anchorNode0.slots.get(detachedFieldSlot), expectedUpdatedCache);
		});
	});

	describe("treeStatusFromDetachedField", () => {
		it("returns TreeStatus.InDocument for root detachedField", () => {
			assert(
				treeStatusFromDetachedField(keyAsDetachedField(rootFieldKey)) ===
					TreeStatus.InDocument,
			);
		});
		it("returns TreeStatus.Removed for non-root detachedField", () => {
			assert(
				treeStatusFromDetachedField(keyAsDetachedField(brand("testKey"))) ===
					TreeStatus.Removed,
			);
		});
	});
});
