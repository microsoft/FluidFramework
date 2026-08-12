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
	});
});
