/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	AnchorSet,
	type FieldKey,
	keyAsDetachedField,
	rootFieldKey,
} from "../../../core/index.js";
import {
	detachedFieldSlot,
	treeStatusFromAnchorCache,
	treeStatusFromDetachedField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/flex-tree/utilities.js";
import { TreeStatus } from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { applyTestDelta } from "../../utils.js";

describe("flex-tree utilities", () => {
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
			assert(treeStatusFromAnchorCache(anchorNode0) === TreeStatus.InDocument);
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
			assert(treeStatusFromAnchorCache(anchorNode0) === TreeStatus.Removed);
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
			assert(treeStatusFromAnchorCache(anchorNode0) === TreeStatus.InDocument);

			// Manually set cache to a non-root detachedField to check if it's being used.
			const testFieldKey: FieldKey = brand("testFieldKey");
			anchorNode0.slots.set(detachedFieldSlot, {
				generationNumber: 0,
				detachedField: keyAsDetachedField(testFieldKey),
			});
			assert(treeStatusFromAnchorCache(anchorNode0) === TreeStatus.Removed);

			// Applies a dummy delta to increment anchorSet generationNumber.
			applyTestDelta(new Map([]), anchors);
			// Checks that the treeStatus is no longer being read from stale cache.
			assert(treeStatusFromAnchorCache(anchorNode0) === TreeStatus.InDocument);
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
			treeStatusFromAnchorCache(anchorNode0);
			assert.deepEqual(anchorNode0.slots.get(detachedFieldSlot), expectedCache);

			// Applies a dummy delta to increment anchorSet generationNumber.
			applyTestDelta(new Map([]), anchors);

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
			treeStatusFromAnchorCache(anchorNode0);
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
