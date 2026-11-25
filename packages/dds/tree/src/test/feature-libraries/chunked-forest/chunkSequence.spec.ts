/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	EmptyKey,
	type FieldKey,
	type TreeChunk,
	type TreeValue,
} from "../../../core/index.js";
/* eslint-disable import-x/no-internal-modules -- Exercise ownership and indexing contracts directly. */
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
import { ChunkCursor } from "../../../feature-libraries/chunked-forest/chunkCursor.js";
import { ChunkEditTraversal } from "../../../feature-libraries/chunked-forest/chunkEditTraversal.js";
import {
	getFieldLength,
	locateNodeInChunks,
} from "../../../feature-libraries/chunked-forest/chunkEditing.js";
import {
	ChunkSequence,
	assertChunksReadable,
	getChunkSequence,
} from "../../../feature-libraries/chunked-forest/chunkSequence.js";
import {
	coalesceUniformChunks,
	defaultChunkPolicy,
	groupChunks,
	splitFieldAtIndex,
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
import { emptyChunk } from "../../../feature-libraries/chunked-forest/emptyChunk.js";
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	TreeShape,
	UniformChunk,
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
/* eslint-enable import-x/no-internal-modules */
import { numberSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { assertStructuralEquality } from "../../utils.js";

import { forEachChunk, getChunkStats, numericBasicChunk } from "./fieldCursorTestUtilities.js";

const shape = new TreeShape(brand(numberSchema.identifier), true, []);

function packed(...values: number[]): UniformChunk {
	return new UniformChunk(shape.withTopLevelLength(values.length), values);
}

function valuesOf(chunks: readonly TreeChunk[]): unknown[] {
	const cursor = ChunkCursor.fromChunks(chunks);
	const values: unknown[] = [];
	for (let next = cursor.firstNode(); next; next = cursor.nextNode()) {
		values.push(cursor.value);
	}
	return values;
}

function assertBalanced(
	chunks: readonly TreeChunk[],
	maximum = defaultChunkPolicy.sequenceChunkSplitThreshold,
): number {
	assert(chunks.length <= maximum, "Child arrays must respect the grouping limit");
	const sequence = getChunkSequence(chunks);
	let length = 0;
	const ends = chunks.map((chunk) => (length += chunk.topLevelLength));
	if (sequence !== undefined) {
		assert.equal(sequence.length, length);
		assert.deepEqual(sequence.index, chunks.length < 2 ? undefined : ends);
	}
	let height: number | undefined;
	for (const chunk of chunks) {
		let nextHeight = 0;
		if (chunk instanceof SequenceChunk) {
			assert(chunk.subChunks.length >= Math.ceil(maximum / 2), "Groups must be half full");
			nextHeight = assertBalanced(chunk.subChunks, maximum) + 1;
		}
		assert(height === undefined || height === nextHeight, "Leaves must have equal depth");
		height = nextHeight;
	}
	return height ?? 0;
}

describe("ChunkSequence", () => {
	it("compares chunks by their contents", () => {
		const make = (value: number): BasicChunk =>
			new BasicChunk(brand("parent"), new Map([[EmptyKey, [packed(value)]]]));
		const root = make(1);
		const equal = make(1);
		const different = make(2);
		assertStructuralEquality(root, equal);
		assert.throws(() => assertStructuralEquality(root, different), /not structurally equal/);
		root.referenceRemoved();
		equal.referenceRemoved();
		different.referenceRemoved();
	});

	it("counts packed chunks inside groups and fields without counting sequences as basic chunks", () => {
		const leaves = Array.from({ length: 128 }, (_, index) => packed(index, index + 1));
		const flat = new BasicChunk(brand("parent"), new Map([[EmptyKey, leaves]]));
		for (const leaf of leaves) {
			leaf.referenceAdded();
		}
		const grouped = new BasicChunk(
			brand("parent"),
			new Map([
				[
					EmptyKey,
					[
						new SequenceChunk(
							groupChunks([...leaves], {
								...defaultChunkPolicy,
								sequenceChunkSplitThreshold: 64,
							}),
						),
					],
				],
			]),
		);
		for (const root of [flat, grouped]) {
			const visited: TreeChunk[] = [];
			forEachChunk(root, (chunk) => {
				if (chunk instanceof UniformChunk) {
					visited.push(chunk);
				}
			});
			assert.deepEqual(visited, leaves);
			assert.deepEqual(getChunkStats(root), {
				total: root === flat ? 129 : 132,
				basic: 1,
				largestUniformNodes: 2,
			});
		}
		const nested = new SequenceChunk([grouped]);
		assert.deepEqual(getChunkStats(nested), { total: 133, basic: 1, largestUniformNodes: 2 });
		nested.referenceRemoved();
		flat.referenceRemoved();
		assert(leaves.every((leaf) => leaf.isUnreferenced()));
	});

	for (const shared of [false, true]) {
		it(`replaces packed values without refreshing offsets (shared: ${shared})`, () => {
			const child = packed(1, 2);
			if (shared) {
				child.referenceAdded();
			}
			const wrapper = new SequenceChunk([packed(0), child, packed(3)]);
			const root = new BasicChunk(brand("parent"), new Map([[EmptyKey, [wrapper]]]));
			const chunks = wrapper.subChunks;
			const sequence = getChunkSequence(chunks);
			assert(sequence !== undefined);
			const ends = sequence.index;
			assert(ends !== undefined);
			// Any attempted suffix refresh now fails, even if it writes identical offsets.
			Object.freeze(ends);
			const editor = new ChunkEditTraversal(root, {
				policy: defaultChunkPolicy,
				idCompressor: undefined,
			});
			editor.enterField(EmptyKey);
			const removed = editor.splice({ start: 2, end: 3 }, [packed(99)]);
			assert.deepEqual(valuesOf(chunks), [0, 1, 99, 3]);
			assert.equal(chunks[1] === child, !shared);
			assert.equal(sequence.index, ends);
			assert.deepEqual(ends, [1, 3, 4]);
			assert.deepEqual(valuesOf(removed), [2]);
			editor.free();
			root.referenceRemoved();
			if (shared) {
				assert.deepEqual(child.values, [1, 2]);
				child.referenceRemoved();
			}
			for (const chunk of removed) {
				chunk.referenceRemoved();
			}
		});
	}

	it("updates fixed-total child boundaries without refreshing its parent", () => {
		const wrapper = new SequenceChunk([packed(1, 2), packed(3)]);
		const parent = new ChunkSequence([wrapper, packed(4)]);
		const ends = parent.index;
		assert(ends !== undefined);
		Object.freeze(ends);
		const childSequence = getChunkSequence(wrapper.subChunks);
		assert(childSequence !== undefined);
		const childEnds = childSequence.index;
		parent.edit((parentEditor) => {
			const cursor = wrapper.getEditCursor(parentEditor.acquireChild(0));
			const field = cursor.getFieldEditor?.();
			assert(field !== undefined);
			const removed = field.splice(0, 2, [packed(1), packed(2, 3)]);
			assert.equal(childSequence.index, childEnds);
			assert.deepEqual(childEnds, [1, 3]);
			assert.equal(locateNodeInChunks(wrapper.subChunks, 1).indexOfChunk, 1);
			assert.deepEqual(valuesOf(wrapper.subChunks), [1, 2, 3]);
			assert.throws(() => field.acquireChild(0, false), /stable child edits/);
			const edit = field.acquireChild(0);
			assert(edit.chunk instanceof UniformChunk);
			assert.throws(
				() => edit.chunk instanceof UniformChunk && edit.chunk.append(edit, [9], 1),
				/Length-preserving edits cannot append/,
			);
			edit.close();
			cursor.release();
			for (const chunk of removed) {
				chunk.referenceRemoved();
			}
		});
		assert.equal(parent.index, ends);
		assert.deepEqual(ends, [3, 4]);
		parent.dispose();
	});

	it("rejects overlapping speculative edits before creating another copy", () => {
		const child = packed(1);
		child.referenceAdded();
		const parent = new ChunkSequence([child]);
		parent.edit((editor) => {
			const first = editor.acquireChild(0, true, true);
			assert.throws(() => editor.acquireChild(0, true, true), /already has a child editor/);
			first.close(false);
			assert(first.chunk.isUnreferenced());
			assert.equal(parent.chunks[0], child);
		});
		parent.dispose();
		child.referenceRemoved();
	});

	it("publishes suffix offsets immediately after splices and contained growth", () => {
		const child = packed(10, 11);
		const sequence = new ChunkSequence([emptyChunk, child, emptyChunk, packed(20)]);
		const chunks = sequence.chunks;
		const editor = sequence.acquireEditor();
		const ends = sequence.index;
		assert(ends !== undefined);
		assert.deepEqual(ends, [0, 2, 2, 3]);
		assert.throws(() => child.acquireEditor(), /through their owner/);
		const edit = editor.acquireChild(1);
		child.append(edit, [12, 13], 2);
		assert.throws(() => assertChunksReadable(chunks), /variable-length child edit/);
		assert.throws(() => sequence.length, /variable-length child edit/);
		assert.throws(() => sequence.locateNode(0), /variable-length child edit/);
		assert.throws(() => locateNodeInChunks(chunks, 0), /variable-length child edit/);
		assert.throws(() => child.cursor(), /length-changing edit/);
		edit.close();
		assertChunksReadable(chunks);
		// Inspect the retained index before a read could rebuild it.
		assert.deepEqual(ends, [0, 4, 4, 5]);
		assert.equal(sequence.length, 5);
		assert.equal(locateNodeInChunks(sequence.chunks, 4).indexOfChunk, 3);
		const removed = editor.splice(1, 1, [packed(30)]);
		assert.deepEqual(ends, [0, 1, 1, 2]);
		assert.deepEqual(valuesOf(sequence.chunks), [30, 20]);
		removed[0].referenceRemoved();
		editor.close();
		sequence.dispose();
		assert(child.isUnreferenced());
	});

	it("handles index creation, removal, and empty boundaries", () => {
		const sequence = new ChunkSequence([]);
		sequence.edit((editor) => {
			assert.equal(sequence.length, 0);
			assert.throws(() => sequence.locateNode(0), /Array index is out of bounds/);
			editor.splice(0, 0, [packed(1, 2)]);
			assert.equal(sequence.index, undefined);
			assert.equal(sequence.locateNode(1).indexWithinChunk, 1);
			editor.splice(0, 0, [emptyChunk, packed(3)]);
			assert.deepEqual(sequence.index, [0, 1, 3]);
			assert.equal(locateNodeInChunks(sequence.chunks, 0).indexOfChunk, 1);
			assert.equal(locateNodeInChunks(sequence.chunks, 2).indexWithinChunk, 1);
			for (const chunk of editor.splice(0, 2)) {
				chunk.referenceRemoved();
			}
			assert.equal(sequence.index, undefined);
			assert.equal(sequence.length, 2);
			assert.equal(sequence.locateNode(1).indexWithinChunk, 1);
			editor.splice(0, 1)[0].referenceRemoved();
			assert.equal(sequence.length, 0);
			assert.throws(() => sequence.locateNode(0), /Array index is out of bounds/);
		});
		sequence.dispose();
		assert.throws(() => sequence.locateNode(0), /ownership has been released/);
	});

	it("copies constructor containers without copying owned children", () => {
		const values: TreeValue[] = [1];
		const child = new UniformChunk(shape.withTopLevelLength(1), values);
		const chunks: TreeChunk[] = [child];
		const fields = new Map([[EmptyKey, chunks]]);
		const parent = new BasicChunk(brand("parent"), fields);
		values[0] = 9;
		chunks.length = 0;
		fields.clear();
		const owned = parent.fields.get(EmptyKey);
		assert(owned !== undefined);
		assert.equal(owned[0], child);
		assert.deepEqual(valuesOf(owned), [1]);
		parent.referenceRemoved();
		assert.equal(owned.length, 0);
		assert(child.isUnreferenced());
	});

	it("keeps small fields unindexed while enforcing owned child edits", () => {
		const child = packed(1);
		const root = new BasicChunk(brand("parent"), new Map([[EmptyKey, [child]]]));
		const chunks = root.fields.get(EmptyKey);
		assert(chunks !== undefined);
		assert.equal(getChunkSequence(chunks), undefined);
		assert.throws(() => child.acquireEditor(), /through their owner/);
		const edit = root.acquireEditor();
		const field = root.acquireField(edit, EmptyKey);
		assert.throws(() => root.acquireField(edit, EmptyKey), /already has an editor/);
		const childEdit = field.acquireChild(0);
		child.append(childEdit, [2], 1);
		assert.throws(() => assertChunksReadable(chunks), /variable-length child edit/);
		assert.throws(() => getFieldLength(chunks), /variable-length child edit/);
		childEdit.close();
		assert.equal(getFieldLength(chunks), 2);
		field.splice(1, 0, [packed(3)]);
		assert.deepEqual(valuesOf(chunks), [1, 2, 3]);
		field.close();
		edit.close();
		assert.equal(root.fields.get(EmptyKey), chunks);
		assert.equal(getChunkSequence(chunks), undefined);
		assert.equal(getFieldLength(chunks), 3);
		assert.throws(() => child.acquireEditor(), /through their owner/);
		root.referenceRemoved();
		assert(child.isUnreferenced());
	});

	it("rejects further reads and edits after a field edit fails", () => {
		const child = packed(1);
		const root = new BasicChunk(brand("parent"), new Map([[EmptyKey, [child]]]));
		const chunks = root.fields.get(EmptyKey);
		assert(chunks !== undefined);
		const edit = root.acquireEditor();
		const field = root.acquireField(edit, EmptyKey);
		const failure = new Error("transform failed");
		assert.throws(
			() =>
				field.transformRange(0, 1, (owned) => {
					owned[0].referenceRemoved();
					throw failure;
				}),
			(error: unknown) => error === failure,
		);
		field.close();
		edit.close();
		assert.throws(() => getFieldLength(chunks), /Invalid or expired sequence editor/);
		assert.throws(() => root.clone(), /Invalid or expired sequence editor/);
		const next = root.acquireEditor();
		assert.throws(() => root.acquireField(next, EmptyKey), /already has an owner or editor/);
		next.close();
	});

	it("releases an unused empty field editor before the field is reopened", () => {
		const root = new BasicChunk(brand("parent"), new Map());
		const edit = root.acquireEditor();
		const field = root.acquireField(edit, EmptyKey);
		const chunks = field.chunks;
		assert.equal(getChunkSequence(chunks), undefined);
		assert.equal(root.fields.has(EmptyKey), false);
		assert.throws(() => root.acquireField(edit, EmptyKey), /already has an editor/);
		field.close();
		assert.equal(getChunkSequence(chunks), undefined);
		assert.throws(() => field.chunks, /Invalid or expired sequence editor/);
		const reopened = root.acquireField(edit, EmptyKey);
		reopened.splice(0, 0, [packed(1)]);
		reopened.close();
		edit.close();
		assertBalanced(root.fields.get(EmptyKey) ?? []);
		assert.deepEqual(valuesOf(root.fields.get(EmptyKey) ?? []), [1]);
		root.referenceRemoved();
	});

	it("editing a long indexed field leaves its clone unchanged", () => {
		const limit = 128;
		const model = Array.from({ length: limit }, (_, index) => index);
		const root = new BasicChunk(
			brand("parent"),
			new Map([[EmptyKey, model.map(numericBasicChunk)]]),
		);
		const editor = new ChunkEditTraversal(root, {
			policy: defaultChunkPolicy,
			idCompressor: undefined,
		});
		editor.enterField(EmptyKey);
		editor.splice({ start: limit, end: limit }, [numericBasicChunk(limit)]);
		model.push(limit);
		editor.free();
		const clone = root.clone();
		const snapshot = [...model];
		const edit = new ChunkEditTraversal(root, {
			policy: defaultChunkPolicy,
			idCompressor: undefined,
		});
		edit.enterField(EmptyKey);
		for (let step = 0; step < limit * 2; step++) {
			const at = Math.floor(model.length / 2);
			edit.splice({ start: at, end: at }, [numericBasicChunk(-step)]);
			model.splice(at, 0, -step);
			if (step % 2 === 0) {
				const removed = edit.splice({ start: at - 1, end: at + 1 }, []);
				model.splice(at - 1, 2);
				for (const chunk of removed) {
					chunk.referenceRemoved();
				}
			}
			const chunks = root.fields.get(EmptyKey);
			assert(chunks !== undefined);
			assertBalanced(chunks);
			assert.deepEqual(valuesOf(chunks), model);
			assert.deepEqual(valuesOf(clone.fields.get(EmptyKey) ?? []), snapshot);
		}
		edit.free();
		root.referenceRemoved();
		clone.referenceRemoved();
	});

	it("splits a long field without walking through every node", () => {
		const count = 4097;
		const chunks = Array.from({ length: count }, (_, index) => numericBasicChunk(index));
		let leafCursorCalls = 0;
		for (const chunk of chunks) {
			const getLocalCursor = chunk.getLocalCursor.bind(chunk);
			chunk.getLocalCursor = (reuse) => {
				leafCursorCalls++;
				return getLocalCursor(reuse);
			};
		}
		const field: TreeChunk[] = [new SequenceChunk(chunks)];
		const middle = Math.floor(count / 2);
		const slot = splitFieldAtIndex(field, middle, {
			policy: defaultChunkPolicy,
			idCompressor: undefined,
		});
		assert.equal(leafCursorCalls, 0, "Splitting should not traverse leaf chunks");
		assert.equal(getFieldLength(field.slice(0, slot)), middle);
		assert.deepEqual(
			valuesOf(field),
			Array.from({ length: count }, (_, index) => index),
		);
		for (const chunk of field) {
			chunk.referenceRemoved();
		}
		assert(chunks.every((chunk) => chunk.isUnreferenced()));
	});

	for (const maximum of [3, 4, 64]) {
		it(`balances repeated appends and bounds fresh lookup depth (limit: ${maximum})`, () => {
			const total = maximum === 64 ? 16384 : 2048;
			const leaves = Array.from({ length: total }, (_, index) => numericBasicChunk(index));
			const root = new BasicChunk(brand("parent"), new Map());
			const editor = new ChunkEditTraversal(root, {
				policy: { ...defaultChunkPolicy, sequenceChunkSplitThreshold: maximum },
				idCompressor: undefined,
			});
			editor.enterField(EmptyKey);
			for (const [index, leaf] of leaves.entries()) {
				editor.splice({ start: index, end: index }, [leaf]);
				const count = index + 1;
				if ([maximum + 1, 97, 98, 1024, 2048, 4096, 8192, 16384].includes(count)) {
					const chunks = root.fields.get(EmptyKey);
					assert(chunks !== undefined);
					const depth = assertBalanced(chunks, maximum);
					assert(depth <= Math.floor(Math.log(count) / Math.log(Math.ceil(maximum / 2))));
					if (count === 4096) {
						leaves[0].referenceAdded = (): never =>
							assert.fail("Appending must not rebuild the untouched prefix");
						const first = chunks[0];
						assert(first instanceof SequenceChunk);
						let prefix = first;
						while (prefix.subChunks[0] instanceof SequenceChunk) {
							prefix = prefix.subChunks[0];
						}
						const ends = getChunkSequence(prefix.subChunks)?.index;
						assert(ends !== undefined);
						Object.freeze(ends);
					}
					const getLocalCursor = SequenceChunk.prototype.getLocalCursor;
					let visits = 0;
					SequenceChunk.prototype.getLocalCursor = function () {
						visits++;
						return getLocalCursor.call(this);
					};
					try {
						for (const position of [0, Math.floor(count / 2), count - 1]) {
							visits = 0;
							const cursor = ChunkCursor.fromChunks(chunks);
							cursor.enterNode(position);
							assert.equal(cursor.value, position);
							assert.equal(visits, depth);
						}
					} finally {
						SequenceChunk.prototype.getLocalCursor = getLocalCursor;
					}
				}
			}
			assert.deepEqual(
				valuesOf(root.fields.get(EmptyKey) ?? []),
				leaves.map((_, index) => index),
			);
			editor.free();
			root.referenceRemoved();
			assert(leaves.every((leaf) => leaf.isUnreferenced()));
		});
	}

	for (const maximum of [3, 4, 64]) {
		it(`balances prepends, middle edits, and shrinking (limit: ${maximum})`, () => {
			const initial = Array.from({ length: 257 }, (_, index) => numericBasicChunk(index));
			const root = new BasicChunk(brand("parent"), new Map([[EmptyKey, initial]]));
			const clone = root.clone();
			const model = initial.map((_, index) => index);
			const editor = new ChunkEditTraversal(root, {
				policy: { ...defaultChunkPolicy, sequenceChunkSplitThreshold: maximum },
				idCompressor: undefined,
			});
			const random = makeRandom(90347);
			editor.enterField(EmptyKey);
			for (let step = 0; step < 256; step++) {
				const at = step < 128 ? 0 : random.integer(0, model.length);
				const count = step < 128 ? 0 : random.integer(0, Math.min(24, model.length - at));
				const added = Array.from(
					{ length: random.integer(1, 4) },
					(_, index) => -step * 4 - index - 1,
				);
				const removed = editor.splice(
					{ start: at, end: at + count },
					added.map(numericBasicChunk),
				);
				model.splice(at, count, ...added);
				for (const chunk of removed) {
					chunk.referenceRemoved();
				}
				const chunks = root.fields.get(EmptyKey) ?? [];
				assertBalanced(chunks, maximum);
				assert.deepEqual(valuesOf(chunks), model);
			}
			while (model.length > 0) {
				const at = Math.floor(model.length / 3);
				const count = Math.min(model.length - at, 17);
				for (const chunk of editor.splice({ start: at, end: at + count }, [])) {
					chunk.referenceRemoved();
				}
				model.splice(at, count);
				const chunks = root.fields.get(EmptyKey) ?? [];
				assertBalanced(chunks, maximum);
				assert.deepEqual(valuesOf(chunks), model);
			}
			editor.free();
			assert.deepEqual(
				valuesOf(clone.fields.get(EmptyKey) ?? []),
				initial.map((_, index) => index),
			);
			root.referenceRemoved();
			clone.referenceRemoved();
			assert(initial.every((leaf) => leaf.isUnreferenced()));
		});
	}

	it("normalizes shared incoming sequences without changing the source", () => {
		const leaves = Array.from({ length: 6 }, (_, index) => numericBasicChunk(index));
		const source = new SequenceChunk([
			new SequenceChunk(leaves.slice(1, 3)),
			new SequenceChunk(leaves.slice(3, 5)),
		]);
		source.referenceAdded();
		const root = new BasicChunk(
			brand("parent"),
			new Map([[EmptyKey, [leaves[0], leaves[5]]]]),
		);
		const editor = new ChunkEditTraversal(root, {
			policy: defaultChunkPolicy,
			idCompressor: undefined,
		});
		editor.enterField(EmptyKey);
		editor.splice({ start: 1, end: 1 }, [source]);
		const chunks = root.fields.get(EmptyKey) ?? [];
		assertBalanced(chunks);
		assert.deepEqual(chunks, leaves);
		assert.deepEqual(valuesOf([source]), [1, 2, 3, 4]);
		editor.free();
		root.referenceRemoved();
		source.referenceRemoved();
		assert(leaves.every((leaf) => leaf.isUnreferenced()));
	});

	it("balances restored ancestors after normalizing packed nodes", () => {
		const maximum = 3;
		const valueKey: FieldKey = brand("value");
		const addedKey: FieldKey = brand("added");
		const rowShape = new TreeShape(brand("row"), false, [[valueKey, shape, 1]]);
		const initial = Array.from(
			{ length: 64 },
			(_, index) =>
				new UniformChunk(
					rowShape.withTopLevelLength(4),
					Array.from({ length: 4 }, (_value, offset) => index * 4 + offset),
				),
		);
		const policy = { ...defaultChunkPolicy, sequenceChunkSplitThreshold: maximum };
		const root = new BasicChunk(
			brand("parent"),
			new Map([[EmptyKey, groupChunks([...initial], policy)]]),
		);
		const snapshot = root.clone();
		const editor = new ChunkEditTraversal(root, { policy, idCompressor: undefined });
		editor.enterField(EmptyKey);
		for (const at of [0, 1, 3, 4, 127, 128, 254, 255]) {
			editor.enterNode(at);
			editor.enterField(addedKey);
			editor.splice({ start: 0, end: 0 }, [numericBasicChunk(-at)]);
			editor.exitField();
			editor.enterField(valueKey);
			editor.enterNode(0);
			assert.equal(editor.value, at);
			editor.exitNode();
			editor.exitField();
			editor.exitNode();
			assert.equal(editor.getFieldLength(), 256);
			assertBalanced(root.fields.get(EmptyKey) ?? [], maximum);
		}
		editor.free();
		for (const [index, chunk] of initial.entries()) {
			assert.deepEqual(
				chunk.values,
				Array.from({ length: 4 }, (_, offset) => index * 4 + offset),
			);
		}
		root.referenceRemoved();
		snapshot.referenceRemoved();
		assert(initial.every((chunk) => chunk.isUnreferenced()));
	});

	it("updates offsets when an equal-length replacement reduces the chunk count", () => {
		const leaves = Array.from({ length: 65 }, (_, index) => numericBasicChunk(index));
		const root = new BasicChunk(
			brand("parent"),
			new Map([[EmptyKey, groupChunks([...leaves], defaultChunkPolicy)]]),
		);
		const clone = root.clone();
		const editor = new ChunkEditTraversal(root, {
			policy: defaultChunkPolicy,
			idCompressor: undefined,
		});
		editor.enterField(EmptyKey);
		for (const chunk of editor.splice({ start: 0, end: 33 }, [
			packed(...Array.from({ length: 33 }, (_, index) => index)),
		])) {
			chunk.referenceRemoved();
		}
		const chunks = root.fields.get(EmptyKey) ?? [];
		assert.equal(chunks.length, 33);
		assertBalanced(chunks);
		assert.deepEqual(
			valuesOf(chunks),
			leaves.map((_, index) => index),
		);
		assert.deepEqual(
			valuesOf(clone.fields.get(EmptyKey) ?? []),
			leaves.map((_, index) => index),
		);
		editor.free();
		root.referenceRemoved();
		clone.referenceRemoved();
		assert(leaves.every((leaf) => leaf.isUnreferenced()));
	});

	it("updates offsets after expanding packed storage at a fixed logical length", () => {
		const initial = [
			packed(...Array.from({ length: 1024 }, (_, index) => index)),
			...Array.from({ length: 64 }, (_, index) => numericBasicChunk(index + 1024)),
		];
		const root = new BasicChunk(
			brand("parent"),
			new Map([[EmptyKey, groupChunks([...initial], defaultChunkPolicy)]]),
		);
		const clone = root.clone();
		const editor = new ChunkEditTraversal(root, {
			policy: defaultChunkPolicy,
			idCompressor: undefined,
		});
		editor.enterField(EmptyKey);
		const added = Array.from(
			{ length: 1024 },
			(_, index) => new BasicChunk(brand("other"), new Map(), index),
		);
		for (const chunk of editor.splice({ start: 0, end: 1024 }, added)) {
			chunk.referenceRemoved();
		}
		const expected = Array.from({ length: 1088 }, (_, index) => index);
		const chunks = root.fields.get(EmptyKey) ?? [];
		assertBalanced(chunks);
		assert.deepEqual(valuesOf(chunks), expected);
		assert.deepEqual(valuesOf(clone.fields.get(EmptyKey) ?? []), expected);
		editor.free();
		root.referenceRemoved();
		clone.referenceRemoved();
		assert([...initial, ...added].every((leaf) => leaf.isUnreferenced()));
	});

	it("copies shared ancestry before editing a singly referenced descendant", () => {
		const child = packed(1, 2);
		const parent = new BasicChunk(brand("parent"), new Map([[EmptyKey, [child, packed(3)]]]));
		parent.referenceAdded();
		const original = new ChunkSequence([parent]);
		const fork = new ChunkSequence([parent]);
		assert.equal(child.isShared(), false);
		fork.edit((root) => {
			root.editChild(0, (parentEdit) => {
				assert(parentEdit.chunk instanceof BasicChunk);
				const copy = parentEdit.chunk;
				assert.notEqual(copy, parent);
				assert.equal(child.isShared(), true);
				const field = copy.acquireField(parentEdit, EmptyKey);
				field.editChild(0, (childEdit) => {
					assert(childEdit.chunk instanceof UniformChunk);
					childEdit.chunk.append(childEdit, [4], 1);
				});
				assert.equal(fork.length, 1);
				assert.deepEqual(valuesOf(field.chunks), [1, 2, 4, 3]);
				field.close();
			});
		});
		assert.deepEqual(valuesOf(parent.fields.get(EmptyKey) ?? []), [1, 2, 3]);
		original.dispose();
		assert(child.isUnreferenced());
		fork.dispose();
	});

	it("keeps stable ancestor lengths readable between descendant edits", () => {
		const parent = new BasicChunk(brand("parent"), new Map([[EmptyKey, [packed(1)]]]));
		const sequence = new ChunkSequence([parent, numericBasicChunk(2)]);
		const ends = sequence.index;
		sequence.edit((root) => {
			root.editChild(0, (edit) => {
				const field = parent.acquireField(edit, EmptyKey);
				field.splice(1, 0, [packed(3, 4)]);
				assert.equal(sequence.length, 2);
				assert.equal(sequence.index, ends);
				assert.deepEqual(valuesOf(field.chunks), [1, 3, 4]);
				field.transformRange(0, 1, (owned) => {
					assert.throws(() => parent.cursor(), /sequence mutation/);
					assert.throws(() => sequence.length, /sequence mutation/);
					assert.throws(() => sequence.locateNode(0), /sequence mutation/);
					return owned;
				});
				field.close();
			});
		});
		sequence.dispose();
	});

	it("requires child scopes to close before their owner can move or be shared", () => {
		const parent = new BasicChunk(brand("parent"), new Map([[EmptyKey, [packed(1)]]]));
		const edit = parent.acquireEditor();
		const field = parent.acquireField(edit, EmptyKey);
		const child = field.acquireChild(0);
		assert.throws(() => edit.close(), /Close child editors/);
		assert.throws(() => field.close(), /Close child editors/);
		assert.throws(() => field.splice(0, 1), /variable-length child edit/);
		assert.throws(() => parent.referenceAdded(), /during an edit/);
		assert.throws(() => parent.referenceRemoved(), /during an edit/);
		assert.throws(() => parent.clone(), /during an edit/);
		child.close();
		field.close();
		edit.close();
		assert.throws(() => parent.acquireField(edit, EmptyKey), /expired chunk editor/);
		parent.referenceRemoved();
	});

	it("does not expose a failed transformation as a successful sequence", () => {
		const child = packed(1);
		const sequence = new ChunkSequence([child]);
		const chunks = sequence.chunks;
		const failure = new Error("transform failed");
		assert.throws(
			() =>
				sequence.edit((editor) => {
					editor.transformRange(0, 1, (owned) => {
						owned[0].referenceRemoved();
						throw failure;
					});
				}),
			(error: unknown) => error === failure,
		);
		assert.throws(() => assertChunksReadable(chunks), /Sequence edit failed/);
		assert.throws(() => sequence.length, /Sequence edit failed/);
		assert.throws(() => sequence.locateNode(0), /Sequence edit failed/);
		assert.throws(() => sequence.acquireEditor(), /Sequence edit failed/);
	});

	it("replaces fixed-length wrappers rather than growing shared wrappers", () => {
		const child = packed(1, 2);
		const wrapper = new SequenceChunk([child]);
		wrapper.referenceAdded();
		const parent = new ChunkSequence([wrapper, packed(4)]);
		assert.throws(
			() => getChunkSequence(wrapper.subChunks)?.acquireEditor(),
			/owner's editor/,
		);
		const children = wrapper.takeChildren();
		assert.notEqual(children, wrapper.subChunks);
		assert.throws(() => child.acquireEditor(), /shared chunk/);
		const expanded = child.clone();
		const edit = expanded.acquireEditor();
		expanded.append(edit, [3], 1);
		edit.close();
		children[0].referenceRemoved();
		const replacement = new SequenceChunk([expanded]);
		parent.edit((editor) => {
			const removed = editor.splice(0, 1, [replacement]);
			assert.equal(wrapper.topLevelLength, 2);
			assert.equal(parent.length, 4);
			assert.deepEqual(valuesOf(parent.chunks), [1, 2, 3, 4]);
			removed[0].referenceRemoved();
		});
		parent.dispose();
	});

	for (const { name, create } of [
		{
			name: "basic chunks",
			create: () => [numericBasicChunk(0), numericBasicChunk(1)],
		},
		{
			name: "chunks with different shapes",
			create: () => [
				packed(0),
				new UniformChunk(new TreeShape(brand("other"), true, []).withTopLevelLength(1), [1]),
			],
		},
		{
			name: "chunks over the merge size limit",
			create: () => [packed(0, 1), packed(2)],
		},
	]) {
		it(`does not recalculate offsets for ${name}`, () => {
			const pair = create();
			const sequence = new ChunkSequence([...pair, packed(3)]);
			const ends = sequence.index;
			assert(ends !== undefined);
			Object.freeze(ends);
			sequence.edit((editor) =>
				coalesceUniformChunks(
					editor,
					{ ...defaultChunkPolicy, uniformChunkNodeCountDynamicTargetMax: 2 },
					{ start: 0, end: 2 },
				),
			);
			assert.equal(sequence.index, ends);
			assert.equal(sequence.chunks[0], pair[0]);
			assert.equal(sequence.chunks[1], pair[1]);
			assert.equal(sequence.chunks.length, 3);
			sequence.dispose();
			assert(pair.every((chunk) => chunk.isUnreferenced()));
		});
	}

	it("merges shared chunks without changing their neighbors", () => {
		const left = packed(1);
		left.referenceAdded();
		const right = packed(2);
		const outside = packed(3);
		const sequence = new ChunkSequence([numericBasicChunk(0), left, right, outside]);
		const ends = sequence.index;
		assert(ends !== undefined);
		// The first chunk does not change, so its offset must not be rewritten.
		Object.defineProperty(ends, 0, { writable: false });
		sequence.edit((editor) =>
			coalesceUniformChunks(editor, defaultChunkPolicy, { start: 0, end: 3 }),
		);
		assert.deepEqual(ends, [1, 3, 4]);
		assert.deepEqual(valuesOf(sequence.chunks), [0, 1, 2, 3]);
		assert.notEqual(sequence.chunks[1], left);
		assert.equal(sequence.chunks[2], outside);
		assert.deepEqual(left.values, [1]);
		assert.equal(left.isShared(), false);
		assert(right.isUnreferenced());
		left.referenceRemoved();
		sequence.dispose();
	});

	it("preserves the accumulator buffer through long in-place coalescing", () => {
		const chunks = Array.from({ length: 200 }, (_, index) => packed(index));
		const accumulator = chunks[0];
		const buffer = accumulator.values;
		const sequence = new ChunkSequence(chunks);
		sequence.edit((editor) =>
			coalesceUniformChunks(editor, {
				...defaultChunkPolicy,
				uniformChunkNodeCountDynamicTargetMax: 200,
			}),
		);
		assert.equal(sequence.chunks[0], accumulator);
		assert.equal(accumulator.values, buffer);
		assert.equal(sequence.chunks.length, 1);
		assert.equal(sequence.length, 200);
		assert.deepEqual(
			buffer,
			Array.from({ length: 200 }, (_, index) => index),
		);
		sequence.dispose();
	});

	it("keeps indexed split, move, and coalesce operations consistent with an array model", () => {
		const random = makeRandom(88440);
		const sequence = new ChunkSequence([]);
		const model: number[] = [];
		const compressor = { policy: defaultChunkPolicy, idCompressor: undefined };
		sequence.edit((editor) => {
			for (let step = 0; step < 200; step++) {
				if (model.length === 0 || random.bool()) {
					const at = random.integer(0, model.length);
					const added = Array.from(
						{ length: random.integer(1, 5) },
						(_, index) => step * 10 + index,
					);
					const slot = splitFieldAtIndex(editor, at, compressor);
					editor.splice(slot, 0, [packed(...added)]);
					model.splice(at, 0, ...added);
				} else {
					const start = random.integer(0, model.length - 1);
					const end = random.integer(start + 1, model.length);
					const first = splitFieldAtIndex(editor, start, compressor);
					const last = splitFieldAtIndex(editor, end, compressor);
					const removed = editor.splice(first, last - first);
					const moved = model.splice(start, end - start);
					if (random.bool()) {
						const at = random.integer(0, model.length);
						editor.splice(splitFieldAtIndex(editor, at, compressor), 0, removed);
						model.splice(at, 0, ...moved);
					} else {
						for (const chunk of removed) {
							chunk.referenceRemoved();
						}
					}
				}
				coalesceUniformChunks(editor, defaultChunkPolicy);
				assert.equal(getFieldLength(sequence.chunks), model.length);
				assert.deepEqual(valuesOf(sequence.chunks), model);
			}
		});
		sequence.dispose();
	});

	it("locates nodes across empty chunks and unequal chunk lengths", () => {
		const chunks = [
			emptyChunk,
			packed(10, 11),
			emptyChunk,
			packed(20),
			packed(30, 31, 32),
			emptyChunk,
		];
		const sequence = new ChunkSequence(chunks);
		const locations = [
			[1, 0],
			[1, 1],
			[3, 0],
			[4, 0],
			[4, 1],
			[4, 2],
		] as const;
		for (const [index, [indexOfChunk, indexWithinChunk]] of locations.entries()) {
			const expected = { chunk: chunks[indexOfChunk], indexOfChunk, indexWithinChunk };
			assert.deepEqual(sequence.locateNode(index), expected);
			assert.deepEqual(locateNodeInChunks(sequence.chunks, index), expected);
		}
		sequence.dispose();
	});

	it("rejects invalid node indices with and without allocated offsets", () => {
		for (const chunks of [
			[],
			[emptyChunk],
			[packed(1, 2)],
			[emptyChunk, packed(1, 2), emptyChunk],
		]) {
			const sequence = new ChunkSequence(chunks);
			for (const [index, message] of [
				[-1, "index must be non-negative"],
				[0.5, "index must be an integer"],
				[Number.NaN, "index must be an integer"],
				[Infinity, "index must be an integer"],
				[Number.MAX_SAFE_INTEGER + 1, "index must be an integer"],
			] as const) {
				assert.throws(() => sequence.locateNode(index), validateAssertionError(message));
				assert.throws(
					() => locateNodeInChunks(sequence.chunks, index),
					validateAssertionError(message),
				);
			}
			const outOfBounds =
				chunks.length === 0 ? "Array index is out of bounds" : "missing edited node";
			for (const index of [sequence.length, sequence.length + 1]) {
				assert.throws(() => sequence.locateNode(index), validateAssertionError(outOfBounds));
				assert.throws(
					() => locateNodeInChunks(sequence.chunks, index),
					validateAssertionError(outOfBounds),
				);
			}
			sequence.dispose();
		}
	});

	it("bounds node lookup probes logarithmically", () => {
		for (const count of [16, 256, 4096]) {
			const chunks = Array.from({ length: count }, (_, index) =>
				packed(index * 3, index * 3 + 1, index * 3 + 2),
			);
			const sequence = new ChunkSequence(chunks);
			const ends = sequence.index;
			assert(ends !== undefined);
			let probes = 0;
			for (let index = 0; index < count; index++) {
				Object.defineProperty(ends, index, {
					get(): number {
						probes++;
						return (index + 1) * 3;
					},
				});
			}
			for (const position of [0, count, count * 3 - 1]) {
				probes = 0;
				const indexOfChunk = Math.floor(position / 3);
				assert.deepEqual(sequence.locateNode(position), {
					chunk: chunks[indexOfChunk],
					indexOfChunk,
					indexWithinChunk: position % 3,
				});
				assert(probes <= Math.ceil(Math.log2(count)) + 2);
			}
			sequence.dispose();
		}
	});

	it("does not cache an unowned mutable array", () => {
		const chunks: TreeChunk[] = [packed(1)];
		assert.equal(getChunkSequence(chunks), undefined);
		assert.equal(getFieldLength(chunks), 1);
		chunks.push(packed(2, 3));
		assert.equal(getFieldLength(chunks), 3);
		assert.equal(locateNodeInChunks(chunks, 2).indexWithinChunk, 1);
		for (const chunk of chunks) {
			chunk.referenceRemoved();
		}
	});
});
