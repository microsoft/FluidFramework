/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { LocalReferenceCollection, type LocalReferencePosition } from "../localReference.js";
import type { ISegmentInternal } from "../mergeTreeNodes.js";
import { ReferenceType } from "../ops.js";
import { TextSegment } from "../textSegment.js";

interface TestSetup {
	collection: LocalReferenceCollection;
	/**
	 * All refs in collection order (offset ascending, and insertion order within an offset).
	 */
	refs: LocalReferencePosition[];
}

/**
 * Creates a collection over a segment of length `text.length` with `refsPerOffset`
 * references at every offset. Each reference is labeled via its `id` property so
 * walk order can be asserted.
 */
function setup(text: string, refsPerOffset: number): TestSetup {
	const segment = TextSegment.make(text) as ISegmentInternal;
	const collection = LocalReferenceCollection.setOrGet(segment);
	const refs: LocalReferencePosition[] = [];
	for (let offset = 0; offset < text.length; offset++) {
		for (let i = 0; i < refsPerOffset; i++) {
			refs.push(
				collection.createLocalRef(offset, ReferenceType.Simple, { id: `${offset}-${i}` }),
			);
		}
	}
	return { collection, refs };
}

function walk(
	collection: LocalReferenceCollection,
	start?: LocalReferencePosition,
	forward: boolean = true,
): string[] {
	const visited: string[] = [];
	collection.walkReferences(
		(lref) => {
			visited.push(lref.properties?.id as string);
		},
		start,
		forward,
	);
	return visited;
}

/**
 * Slides references into the `before` bucket at offset 0, or the `after` bucket at the last
 * offset, of `collection`. Tombstoned references arrive from a segment that was removed, so
 * they are created on a donor segment and re-linked by the collection.
 */
function addTombstones(
	collection: LocalReferenceCollection,
	position: "before" | "after",
	ids: string[],
): LocalReferencePosition[] {
	const donor = TextSegment.make("x") as ISegmentInternal;
	const donorCollection = LocalReferenceCollection.setOrGet(donor);
	const refs = ids.map((id) =>
		donorCollection.createLocalRef(0, ReferenceType.SlideOnRemove, { id }),
	);
	if (position === "before") {
		collection.addBeforeTombstones(refs);
	} else {
		collection.addAfterTombstones(refs);
	}
	return refs;
}

describe("LocalReferenceCollection", () => {
	describe("walkReferences", () => {
		it("walks all references when no start is provided", () => {
			const { collection } = setup("abc", 2);
			assert.deepEqual(walk(collection), ["0-0", "0-1", "1-0", "1-1", "2-0", "2-1"]);
		});

		it("walks all references backward when no start is provided", () => {
			const { collection } = setup("abc", 2);
			assert.deepEqual(walk(collection, undefined, false), [
				"2-1",
				"2-0",
				"1-1",
				"1-0",
				"0-1",
				"0-0",
			]);
		});

		it("includes the start reference when walking forward", () => {
			const { collection, refs } = setup("abc", 2);
			// refs[2] is the first reference at offset 1
			assert.deepEqual(walk(collection, refs[2]), ["1-0", "1-1", "2-0", "2-1"]);
		});

		it("includes the start reference when walking backward", () => {
			const { collection, refs } = setup("abc", 2);
			assert.deepEqual(walk(collection, refs[2], false), ["1-0", "0-1", "0-0"]);
		});

		it("resumes mid-list when start is not the first reference at its offset", () => {
			const { collection, refs } = setup("abc", 3);
			// refs[4] is the second reference at offset 1
			assert.deepEqual(walk(collection, refs[4]), ["1-1", "1-2", "2-0", "2-1", "2-2"]);
			assert.deepEqual(walk(collection, refs[4], false), ["1-1", "1-0", "0-2", "0-1", "0-0"]);
		});

		it("includes the start reference at the first offset", () => {
			const { collection, refs } = setup("abc", 1);
			assert.deepEqual(walk(collection, refs[0]), ["0-0", "1-0", "2-0"]);
			assert.deepEqual(walk(collection, refs[0], false), ["0-0"]);
		});

		it("includes the start reference at the last offset", () => {
			const { collection, refs } = setup("abc", 1);
			assert.deepEqual(walk(collection, refs[2]), ["2-0"]);
			assert.deepEqual(walk(collection, refs[2], false), ["2-0", "1-0", "0-0"]);
		});

		it("stops early when the visitor returns false", () => {
			const { collection, refs } = setup("abc", 2);
			const visited: string[] = [];
			const completed = collection.walkReferences((lref) => {
				visited.push(lref.properties?.id as string);
				return lref.properties?.id !== "1-1";
			}, refs[2]);
			assert.equal(completed, false);
			assert.deepEqual(visited, ["1-0", "1-1"]);
		});

		describe("when an offset holds multiple buckets", () => {
			/**
			 * Builds a collection over "abc" with an `at` reference at every offset, a `before`
			 * bucket coexisting with `at` at offset 0, and an `after` bucket coexisting with `at`
			 * at offset 2.
			 */
			function setupMultiBucket(): {
				collection: LocalReferenceCollection;
				at: LocalReferencePosition[];
				before: LocalReferencePosition[];
				after: LocalReferencePosition[];
			} {
				const { collection, refs: at } = setup("abc", 1);
				const before = addTombstones(collection, "before", ["b-0", "b-1"]);
				const after = addTombstones(collection, "after", ["a-0", "a-1"]);
				return { collection, at, before, after };
			}

			it("walks buckets in before/at/after order", () => {
				const { collection } = setupMultiBucket();
				assert.deepEqual(walk(collection), ["b-0", "b-1", "0-0", "1-0", "2-0", "a-0", "a-1"]);
				assert.deepEqual(walk(collection, undefined, false), [
					"a-1",
					"a-0",
					"2-0",
					"1-0",
					"0-0",
					"b-1",
					"b-0",
				]);
			});

			it("skips sibling buckets preceding the bucket holding start", () => {
				const { collection, at } = setupMultiBucket();
				// Starting at the `at` bucket must discard the `before` bucket at the same offset,
				// without discarding the `at` bucket itself.
				assert.deepEqual(walk(collection, at[0]), ["0-0", "1-0", "2-0", "a-0", "a-1"]);
				// Starting at the `at` bucket of the last offset must discard nothing it needs,
				// and still reach the trailing `after` bucket.
				assert.deepEqual(walk(collection, at[2]), ["2-0", "a-0", "a-1"]);
			});

			it("skips sibling buckets following the bucket holding start when walking backward", () => {
				const { collection, at } = setupMultiBucket();
				// Walking backward from the `at` bucket must discard the trailing `after` bucket
				// at the same offset, then continue into the `before` bucket.
				assert.deepEqual(walk(collection, at[2], false), ["2-0", "1-0", "0-0", "b-1", "b-0"]);
				assert.deepEqual(walk(collection, at[0], false), ["0-0", "b-1", "b-0"]);
			});

			it("starts within the before bucket", () => {
				const { collection, before } = setupMultiBucket();
				assert.deepEqual(walk(collection, before[1]), [
					"b-1",
					"0-0",
					"1-0",
					"2-0",
					"a-0",
					"a-1",
				]);
				assert.deepEqual(walk(collection, before[1], false), ["b-1", "b-0"]);
			});

			it("starts within the after bucket", () => {
				const { collection, after } = setupMultiBucket();
				assert.deepEqual(walk(collection, after[0]), ["a-0", "a-1"]);
				assert.deepEqual(walk(collection, after[0], false), [
					"a-0",
					"2-0",
					"1-0",
					"0-0",
					"b-1",
					"b-0",
				]);
			});
		});
	});
});
