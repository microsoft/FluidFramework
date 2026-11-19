/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";

import { EmptyKey, type TreeChunk, type TreeValue } from "../../../core/index.js";
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
	findChunkIndex,
	getChunkSequence,
} from "../../../feature-libraries/chunked-forest/chunkSequence.js";
import {
	coalesceUniformChunks,
	defaultChunkPolicy,
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

import { numericBasicChunk } from "./fieldCursorTestUtilities.js";

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

	for (const shared of [false, true]) {
		it(`replaces packed values without refreshing offsets (shared: ${shared})`, () => {
			const child = packed(1, 2);
			if (shared) {
				child.referenceAdded();
			}
			const root = new BasicChunk(
				brand("parent"),
				new Map([[EmptyKey, [packed(0), child, packed(3)]]]),
			);
			const chunks = root.fields.get(EmptyKey);
			assert(chunks !== undefined);
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
		const editor = sequence.acquireEditor();
		const ends = sequence.index;
		assert(ends !== undefined);
		assert.deepEqual(ends, [0, 2, 2, 3]);
		assert.throws(() => child.acquireEditor(), /through their owner/);
		const edit = editor.acquireChild(1);
		child.append(edit, [12, 13], 2);
		assert.throws(() => sequence.length, /variable-length child edit/);
		assert.throws(() => child.cursor(), /length-changing edit/);
		edit.close();
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
			editor.splice(0, 0, [packed(1, 2)]);
			assert.equal(sequence.index, undefined);
			editor.splice(0, 0, [emptyChunk, packed(3)]);
			assert.deepEqual(sequence.index, [0, 1, 3]);
			assert.equal(locateNodeInChunks(sequence.chunks, 0).indexOfChunk, 1);
			assert.equal(locateNodeInChunks(sequence.chunks, 2).indexWithinChunk, 1);
			for (const chunk of editor.splice(0, 2)) {
				chunk.referenceRemoved();
			}
			assert.equal(sequence.index, undefined);
			assert.equal(sequence.length, 2);
			editor.splice(0, 1)[0].referenceRemoved();
			assert.equal(sequence.length, 0);
		});
		sequence.dispose();
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
		assert(child.isUnreferenced());
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
		assert.throws(() => sequence.length, /Sequence edit failed/);
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

	it("bounds binary-search probes logarithmically", () => {
		for (const count of [16, 256, 4096]) {
			let probes = 0;
			const ends = new Proxy(
				Array.from({ length: count }, (_, index) => (index + 1) * 3),
				{
					get(target, key): number | undefined {
						if (key === "length") {
							return target.length;
						}
						probes++;
						return typeof key === "string" ? target[Number(key)] : undefined;
					},
				},
			);
			for (const position of [0, count, count * 3 - 1, count * 3]) {
				probes = 0;
				assert.equal(findChunkIndex(ends, position), Math.floor(position / 3));
				assert(probes <= Math.ceil(Math.log2(count)) + 1);
			}
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
