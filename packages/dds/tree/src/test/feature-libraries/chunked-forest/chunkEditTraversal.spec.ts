/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	CursorLocationType,
	EmptyKey,
	TreeStoredSchemaRepository,
	type FieldKey,
	type TreeNodeSchemaIdentifier,
} from "../../../core/index.js";
import {
	BasicChunk,
	BasicChunkLocalCursor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/basicChunk.js";
import {
	ChunkEditTraversal,
	ensureExclusiveBasicChunk,
	trySpliceField,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkEditTraversal.js";
import {
	type ChunkEditCursor,
	locateNodeInChunks,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkEditing.js";
import {
	basicOnlyChunkPolicy,
	defaultChunkPolicy,
	makeTreeChunker,
	type ChunkCompressor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import {
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
	type TreeChunk,
} from "../../../feature-libraries/index.js";
import { SchemaFactory, numberSchema, toInitialSchema } from "../../../simple-tree/index.js";
import { brand, makeArray } from "../../../util/index.js";
import { numericBasicChunk } from "./fieldCursorTestUtilities.js";

const basicOnlyChunkCompressor: ChunkCompressor = {
	policy: basicOnlyChunkPolicy,
	idCompressor: undefined,
};

/**
 * Direct tests for ChunkEditTraversal, trySpliceField, and ensureExclusiveBasicChunk.
 * BasicChunk and SequenceChunk adapter write-back is also exercised here with real generic field edits.
 * Read cursor conformance lives in basicChunk.spec.ts and chunkCursor.spec.ts;
 * visitor-level integration remains in chunkedForest.spec.ts, and uniform inline edits in uniformChunk.spec.ts.
 */
describe("chunkEditTraversal", () => {
	describe("ChunkEditTraversal", () => {
		it("handles insert, replacement, and removal with non-optional results", () => {
			const parent = new BasicChunk(brand("parent"), new Map());
			const cursor = new ChunkEditTraversal(parent, basicOnlyChunkCompressor);
			cursor.enterField(EmptyKey);
			const first = new BasicChunk(brand(numberSchema.identifier), new Map(), 1);
			const second = new BasicChunk(brand(numberSchema.identifier), new Map(), 2);
			const incoming = [first, second];
			// These assignments check the composed editor's complete contract at compile time.
			const inserted: TreeChunk[] = cursor.splice({ start: 0, end: 0 }, incoming);
			assert.deepEqual(inserted, []);
			assert.deepEqual(parent.fields.get(EmptyKey), incoming);
			const replacement = new BasicChunk(brand("string"), new Map(), "replacement");
			// The child declines replacing its own root; the shared editor completes the containing-field edit.
			const replaced: TreeChunk[] = cursor.splice({ start: 0, end: 1 }, [replacement]);
			assert.deepEqual(replaced, [first]);
			assert.deepEqual(parent.fields.get(EmptyKey), [replacement, second]);
			assert.equal(first.isUnreferenced(), false);
			const removed: TreeChunk[] = cursor.splice({ start: 0, end: 2 }, []);
			assert.deepEqual(removed, [replacement, second]);
			assert.equal(parent.fields.has(EmptyKey), false);
			assert.equal(cursor.getFieldLength(), 0);
			assert.deepEqual(incoming, [first, second]);
			for (const chunk of [...replaced, ...removed]) {
				assert.equal(chunk.isShared(), false);
				assert.equal(chunk.isUnreferenced(), false);
				chunk.referenceRemoved();
			}
			cursor.free();
			parent.referenceRemoved();
		});

		it("normalizes inside shared nested sequences without losing the owning slots", () => {
			const valueKey: FieldKey = brand("value");
			const addedKey: FieldKey = brand("added");
			const leaf = new TreeShape(brand(numberSchema.identifier), true, []);
			const shape = new TreeShape(brand("object"), false, [[valueKey, leaf, 1]]);
			const original = new UniformChunk(shape.withTopLevelLength(3), [1, 2, 3]);
			const nested = new SequenceChunk([new SequenceChunk([original])]);
			const sequence = new SequenceChunk([numericBasicChunk(0), nested, numericBasicChunk(4)]);
			const snapshot = new BasicChunk(brand("root"), new Map([[EmptyKey, [sequence]]]));
			const root = snapshot.clone();
			const editor = new ChunkEditTraversal(root, basicOnlyChunkCompressor);
			editor.enterField(EmptyKey);
			editor.enterNode(2);
			editor.enterField(valueKey);
			const outgoing = editor.splice({ start: 0, end: 1 }, [numericBasicChunk(99)]);
			const editedSequence = root.fields.get(EmptyKey)?.[0];
			assert(editedSequence instanceof SequenceChunk);
			assert.notEqual(editedSequence, sequence);
			assert.equal(editedSequence.subChunks[0], sequence.subChunks[0]);
			assert.equal(editedSequence.subChunks[2], sequence.subChunks[2]);
			editor.exitField();
			editor.enterField(addedKey);
			assert.deepEqual(editor.splice({ start: 0, end: 0 }, [numericBasicChunk(100)]), []);
			editor.exitField();
			editor.enterField(valueKey);
			editor.enterNode(0);
			assert.equal(editor.value, 99);
			editor.exitNode();
			editor.exitField();
			editor.exitNode();
			assert(editor.isRootField(EmptyKey));
			assert.equal(editor.getFieldLength(), 5);
			editor.enterNode(3);
			editor.enterField(valueKey);
			editor.enterNode(0);
			assert.equal(editor.value, 3);
			editor.free();
			assert.deepEqual(original.values, [1, 2, 3]);
			for (const chunk of outgoing) {
				chunk.referenceRemoved();
			}
			root.referenceRemoved();
			snapshot.referenceRemoved();
		});

		it("requires an exclusive root and borrows its reference", () => {
			const root = new BasicChunk(brand("root"), new Map());
			root.referenceAdded();
			assert.throws(
				() => new ChunkEditTraversal(root, basicOnlyChunkCompressor),
				/exclusive chunk ownership/,
			);
			root.referenceRemoved();
			const editor = new ChunkEditTraversal(root, basicOnlyChunkCompressor);
			assert.equal(root.isShared(), false);
			assert.equal("fork" in editor, false);
			assert.equal("fromChunk" in ChunkEditTraversal, false);
			editor.free();
			assert.equal(root.isUnreferenced(), false);
			assert.throws(() => editor.enterField(EmptyKey), /freed/);
			root.referenceRemoved();
		});

		it("makes shared descendants exclusive before editing and restores traversal after conversion", () => {
			const valueKey: FieldKey = brand("value");
			const addedKey: FieldKey = brand("added");
			const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
			const innerShape = new TreeShape(brand("inner"), false, [[valueKey, numberShape, 1]]);
			const outerShape = new TreeShape(brand("outer"), false, [[EmptyKey, innerShape, 1]]);
			const original = new UniformChunk(outerShape.withTopLevelLength(3), [1, 2, 3]);
			const originalParent = new BasicChunk(
				brand("parent"),
				new Map([[EmptyKey, [original]]]),
			);
			const snapshot = new BasicChunk(brand("root"), new Map([[EmptyKey, [originalParent]]]));
			const root = snapshot.clone();
			assert.equal(original.isShared(), false);
			const editor = new ChunkEditTraversal(root, basicOnlyChunkCompressor);
			editor.enterField(EmptyKey);
			editor.enterNode(0);
			editor.enterField(EmptyKey);
			editor.enterNode(1);
			editor.enterField(EmptyKey);
			editor.enterNode(0);
			editor.enterField(valueKey);
			const parent = root.fields.get(EmptyKey)?.[0];
			assert(parent instanceof BasicChunk);
			assert.notEqual(parent, originalParent);
			const exclusive = parent.fields.get(EmptyKey)?.[0];
			assert(exclusive instanceof UniformChunk);
			assert.notEqual(exclusive, original);
			assert.equal(exclusive.isShared(), false);
			// Check exclusivity before any mutation, including sharing revealed only by cloning the parent.
			const outgoing = editor.splice({ start: 0, end: 1 }, [
				new UniformChunk(numberShape.withTopLevelLength(1), [99]),
			]);
			assert.equal(parent.fields.get(EmptyKey)?.[0], exclusive);
			assert.deepEqual(exclusive.values, [1, 99, 3]);
			editor.exitField();
			editor.enterField(addedKey);
			// This absent-field insertion cannot keep the old shape and must normalize the current path.
			assert.deepEqual(
				editor.splice({ start: 0, end: 0 }, [
					new BasicChunk(numberShape.type, new Map(), 100),
				]),
				[],
			);
			editor.exitField();
			editor.enterField(valueKey);
			const removed: TreeChunk[] = editor.splice({ start: 0, end: 1 }, []);
			assert.equal(editor.getFieldLength(), 0);
			editor.exitField();
			editor.enterField(addedKey);
			assert.equal(editor.getFieldLength(), 1);
			editor.exitField();
			editor.exitNode();
			editor.exitField();
			editor.exitNode();
			// Continue in an untouched sibling after unwinding the rebuilt chunk boundaries.
			editor.enterNode(2);
			editor.enterField(EmptyKey);
			assert.equal(editor.getFieldLength(), 1);
			editor.exitField();
			editor.exitNode();
			editor.exitField();
			editor.exitNode();
			assert.equal(editor.isRootField(EmptyKey), true);
			editor.exitField();
			editor.free();
			assert.deepEqual(original.values, [1, 2, 3]);
			for (const chunk of [...outgoing, ...removed]) {
				chunk.referenceRemoved();
			}
			root.referenceRemoved();
			snapshot.referenceRemoved();
		});
	});

	describe("trySpliceField", () => {
		it("finalizes generic field edits after a format-specific splice declines", () => {
			const parent = new BasicChunk(brand("parent"), new Map());
			const cursor: BasicChunkLocalCursor & ChunkEditCursor = parent.getEditCursor();
			cursor.enterNode(0);
			cursor.enterField(EmptyKey);
			let attempts = 0;
			let writeBacks = 0;
			cursor.trySplice = () => {
				attempts++;
				return undefined;
			};
			const setFieldChunks = cursor.setFieldChunks.bind(cursor);
			cursor.setFieldChunks = (chunks) => {
				writeBacks++;
				assert.equal(cursor.getFieldKey(), EmptyKey);
				setFieldChunks(chunks);
			};
			const incoming = numericBasicChunk(1);
			assert.deepEqual(
				trySpliceField(cursor, { start: 0, end: 0 }, [incoming], basicOnlyChunkCompressor),
				[],
			);
			const owned = parent.fields.get(EmptyKey);
			assert.deepEqual(owned, [incoming]);
			assert.equal(incoming.isShared(), false);
			assert.deepEqual(
				trySpliceField(cursor, { start: 0, end: 1 }, [], basicOnlyChunkCompressor),
				[incoming],
			);
			assert.equal(attempts, 2);
			assert.equal(writeBacks, 2);
			assert.deepEqual(owned, []);
			assert.equal(parent.fields.has(EmptyKey), false);
			assert.equal(cursor.getFieldLength(), 0);
			assert.equal(incoming.isUnreferenced(), false);
			incoming.referenceRemoved();
			parent.referenceRemoved();
		});

		it("preserves uniform storage when generic replacement descends through shared sequences", () => {
			const shape = new TreeShape(brand(numberSchema.identifier), true, []);
			const original = new UniformChunk(shape.withTopLevelLength(3), [1, 2, 3]);
			const inner = new SequenceChunk([original]);
			const outer = new SequenceChunk([numericBasicChunk(0), inner, numericBasicChunk(4)]);
			const snapshot = new BasicChunk(brand("parent"), new Map([[EmptyKey, [outer]]]));
			const parent = snapshot.clone();
			assert.equal(original.isShared(), false);
			const editor = new ChunkEditTraversal(parent, basicOnlyChunkCompressor);
			editor.enterField(EmptyKey);
			const incoming = new UniformChunk(shape.withTopLevelLength(1), [99]);
			const removed = editor.splice({ start: 2, end: 3 }, [incoming]);
			const editedOuter = parent.fields.get(EmptyKey)?.[0];
			assert(editedOuter instanceof SequenceChunk);
			assert.notEqual(editedOuter, outer);
			assert.equal(editedOuter.topLevelLength, 5);
			assert.equal(editedOuter.subChunks[0], outer.subChunks[0]);
			assert.equal(editedOuter.subChunks[2], outer.subChunks[2]);
			const editedInner = editedOuter.subChunks[1];
			assert(editedInner instanceof SequenceChunk);
			assert.notEqual(editedInner, inner);
			assert.equal(editedInner.topLevelLength, 3);
			const edited = editedInner.subChunks[0];
			assert(edited instanceof UniformChunk);
			assert.notEqual(edited, original);
			assert.equal(edited.isShared(), false);
			assert.deepEqual(edited.values, [1, 99, 3]);
			assert.deepEqual(original.values, [1, 2, 3]);
			assert.deepEqual(removed, [incoming]);
			assert.deepEqual(incoming.values, [2]);
			assert.equal(editor.getFieldLength(), 5);
			editor.free();
			incoming.referenceRemoved();
			parent.referenceRemoved();
			snapshot.referenceRemoved();
		});

		// A non-uniform representation opts into root edits using the same API as every other editable chunk.
		class RootEditableLeaf extends BasicChunk {
			public calls = 0;
			public lastClone: RootEditableLeaf | undefined;

			public constructor(
				private readonly accepts: boolean,
				value: number,
			) {
				super(brand(numberSchema.identifier), new Map(), value);
			}

			public override clone(): RootEditableLeaf {
				assert.equal(typeof this.value, "number");
				return (this.lastClone = new RootEditableLeaf(this.accepts, this.value as number));
			}

			public override getEditCursor(): BasicChunkLocalCursor & ChunkEditCursor {
				const cursor: BasicChunkLocalCursor & ChunkEditCursor = super.getEditCursor();
				cursor.trySplice = (range, content, compressor) => {
					this.calls++;
					assert.equal(cursor.mode, CursorLocationType.Fields);
					assert.equal(cursor.atChunkRoot(), true);
					assert.deepEqual(range, { start: 0, end: 1 });
					assert.equal(compressor, basicOnlyChunkCompressor);
					assert.equal(this.isShared(), false);
					if (!this.accepts) {
						return undefined;
					}
					assert.equal(content.length, 1);
					const source = content[0];
					assert.equal(source.topLevelLength, 1);
					const reader = source.cursor();
					reader.enterNode(0);
					const removed = new BasicChunk(this.type, new Map(), this.value);
					this.value = reader.value;
					source.referenceRemoved();
					return [removed];
				};
				return cursor;
			}
		}

		for (const shared of [false, true]) {
			for (const accepts of [false, true]) {
				it(`delegates generically to a non-uniform child (shared: ${shared}, accepts: ${accepts})`, () => {
					const child = new RootEditableLeaf(accepts, 1);
					if (shared) {
						child.referenceAdded();
					}
					const parent = new BasicChunk(brand("parent"), new Map([[EmptyKey, [child]]]));
					const editor = new ChunkEditTraversal(parent, basicOnlyChunkCompressor);
					editor.enterField(EmptyKey);
					const incoming = new BasicChunk(brand(numberSchema.identifier), new Map(), 99);
					const removed = editor.splice({ start: 0, end: 1 }, [incoming]);
					const attempted = shared ? child.lastClone : child;
					assert(attempted !== undefined);
					assert.equal(attempted.calls, 1);
					assert.equal(parent.fields.get(EmptyKey)?.[0], accepts ? attempted : incoming);
					if (shared) {
						assert.equal(child.value, 1);
						assert.equal(attempted.isUnreferenced(), !accepts);
						child.referenceRemoved();
					}
					const reader = removed[0].cursor();
					reader.enterNode(0);
					assert.equal(reader.value, 1);
					editor.free();
					for (const chunk of removed) {
						chunk.referenceRemoved();
					}
					parent.referenceRemoved();
				});
			}
		}

		it("declines root-sequence edits but rejects delegated edit locations", () => {
			const shape = new TreeShape(brand(numberSchema.identifier), true, []);
			const child = new UniformChunk(shape.withTopLevelLength(1), [1]);
			const parent = new BasicChunk(brand("parent"), new Map([[EmptyKey, [child]]]));
			const cursor = parent.getEditCursor();
			const incoming = new BasicChunk(brand("replacement"), new Map());
			assert.equal(
				trySpliceField(cursor, { start: 0, end: 1 }, [incoming], basicOnlyChunkCompressor),
				undefined,
			);
			assert.equal(incoming.isUnreferenced(), false);
			assert.equal(parent.isUnreferenced(), false);
			assert.throws(
				() => trySpliceField(cursor, { start: 0, end: 2 }, [], basicOnlyChunkCompressor),
				/field length/,
			);
			cursor.enterNode(0);
			cursor.enterField(EmptyKey);
			assert.throws(() => cursor.enterNode(0), /Only the root node is stored inline/);
			assert.deepEqual(child.values, [1]);
			incoming.referenceRemoved();
			parent.referenceRemoved();
		});

		for (const shared of [false, true]) {
			it(`preserves uniform child storage through the owned-field API (shared: ${shared})`, () => {
				const shape = new TreeShape(brand(numberSchema.identifier), true, []);
				const child = new UniformChunk(shape.withTopLevelLength(3), [1, 2, 3]);
				const parent = new BasicChunk(brand("parent"), new Map([[EmptyKey, [child]]]));
				// Simulate a second owner without involving forest dispatch or navigation.
				if (shared) {
					child.referenceAdded();
				}
				const cursor = parent.getEditCursor();
				cursor.enterNode(0);
				cursor.enterField(EmptyKey);
				const incoming = new UniformChunk(shape.withTopLevelLength(1), [99]);
				const removed = trySpliceField(
					cursor,
					{ start: 1, end: 2 },
					[incoming],
					basicOnlyChunkCompressor,
				);
				assert(removed !== undefined);
				const children = parent.fields.get(EmptyKey);
				assert.equal(children?.length, 1);
				const edited = children?.[0];
				assert(edited instanceof UniformChunk);
				assert.equal(edited === child, !shared);
				assert.deepEqual(edited.values, [1, 99, 3]);
				assert.equal(edited.isShared(), false);
				assert.equal(removed[0], incoming);
				assert.deepEqual(incoming.values, [2]);
				if (shared) {
					assert.deepEqual(child.values, [1, 2, 3]);
					assert.equal(child.isShared(), false);
					child.referenceRemoved();
				}
				incoming.referenceRemoved();
				parent.referenceRemoved();
			});
		}

		it("handles shape-changing edits to uniform children without declining", () => {
			const shape = new TreeShape(brand(numberSchema.identifier), true, []);
			const child = new UniformChunk(shape.withTopLevelLength(3), [1, 2, 3]);
			const parent = new BasicChunk(brand("parent"), new Map([[EmptyKey, [child]]]));
			const cursor = parent.getEditCursor();
			cursor.enterNode(0);
			cursor.enterField(EmptyKey);
			const replacement = new BasicChunk(brand("string"), new Map(), "replacement");
			const removed = trySpliceField(
				cursor,
				{ start: 1, end: 2 },
				[replacement],
				basicOnlyChunkCompressor,
			);
			assert(removed !== undefined);
			assert.equal(cursor.getFieldLength(), 3);
			const reader = parent.cursor();
			reader.enterNode(0);
			reader.enterField(EmptyKey);
			reader.enterNode(1);
			assert.equal(reader.value, "replacement");
			assert(removed[0] instanceof UniformChunk);
			assert.deepEqual(removed[0].values, [2]);
			for (const chunk of removed) {
				chunk.referenceRemoved();
			}
			parent.referenceRemoved();
		});

		it("preserves its length through replacements and declines length-changing root edits", () => {
			const root = new SequenceChunk([numericBasicChunk(1), numericBasicChunk(2)]);
			const editor = root.getEditCursor();
			assert.equal("enterNode" in root.getLocalCursor(), false);
			assert.equal("enterNode" in editor, false);
			const incoming = numericBasicChunk(3);
			assert.equal(
				trySpliceField(editor, { start: 0, end: 0 }, [incoming], basicOnlyChunkCompressor),
				undefined,
			);
			assert.equal(incoming.isUnreferenced(), false);
			const outgoing = trySpliceField(
				editor,
				{ start: 0, end: 1 },
				[incoming],
				basicOnlyChunkCompressor,
			);
			assert(outgoing !== undefined);
			assert.equal(root.topLevelLength, 2);
			assert.equal(editor.getFieldLength(), 2);
			assert.equal(root.subChunks[0], incoming);
			for (const chunk of outgoing) {
				chunk.referenceRemoved();
			}
			root.referenceRemoved();
		});
	});

	describe("ensureExclusiveBasicChunk", () => {
		/** Shape used to construct the uniform chunks in these tests. */
		const numberShape = new TreeShape(
			brand<TreeNodeSchemaIdentifier>(numberSchema.identifier),
			true,
			[],
		);

		function makeCompressor(): ChunkCompressor {
			const schema = new TreeStoredSchemaRepository(toInitialSchema(SchemaFactory.number));
			return {
				policy: makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
				idCompressor: undefined,
			};
		}

		function valuesFromChunks(chunks: readonly TreeChunk[]): unknown[] {
			const values: unknown[] = [];
			for (const chunk of chunks) {
				const cursor = chunk.cursor();
				for (let hasNode = cursor.firstNode(); hasNode; hasNode = cursor.nextNode()) {
					values.push(cursor.value);
				}
			}
			return values;
		}

		it("returns an exclusively owned BasicChunk unchanged", () => {
			const basic = new BasicChunk(numberShape.type, new Map(), 0);
			const chunks: TreeChunk[] = [basic];

			const result = ensureExclusiveBasicChunk(chunks, 0, makeCompressor());

			assert.equal(result, basic);
			assert.equal(chunks[0], basic);
			assert.equal(result.isShared(), false);
		});

		it("rejects an invalid index without modifying the chunks", () => {
			const uniform = new UniformChunk(numberShape.withTopLevelLength(2), [0, 1]);
			const chunks: TreeChunk[] = [uniform];

			assert.throws(
				() => ensureExclusiveBasicChunk(chunks, 2, makeCompressor()),
				validateAssertionError("missing edited node"),
			);

			assert.deepEqual(chunks, [uniform]);
			assert.equal(uniform.isUnreferenced(), false);
		});

		it("clones a shared BasicChunk and releases the array's old reference", () => {
			const basic = new BasicChunk(numberShape.type, new Map(), 0);
			basic.referenceAdded();
			const chunks: TreeChunk[] = [basic];

			const result = ensureExclusiveBasicChunk(chunks, 0, makeCompressor());

			assert.notEqual(result, basic);
			assert.equal(chunks[0], result);
			assert.equal(result.isShared(), false);
			assert.equal(basic.isShared(), false);
		});

		it("normalizes a UniformChunk and selects the requested node", () => {
			const uniform = new UniformChunk(numberShape.withTopLevelLength(3), [0, 1, 2]);
			const chunks: TreeChunk[] = [uniform];

			const result = ensureExclusiveBasicChunk(chunks, 2, makeCompressor());

			assert.equal(result, locateNodeInChunks(chunks, 2).chunk);
			assert.equal(result.value, 2);
			assert.equal(result.isShared(), false);
			assert.equal(uniform.isUnreferenced(), true);
			assert.deepEqual(valuesFromChunks(chunks), [0, 1, 2]);
		});

		it("selects the requested node when the containing chunk and node offsets are nonzero", () => {
			const leading = new BasicChunk(numberShape.type, new Map(), -1);
			const uniform = new UniformChunk(numberShape.withTopLevelLength(3), [0, 1, 2]);
			const trailing = new BasicChunk(numberShape.type, new Map(), 3);
			const chunks: TreeChunk[] = [leading, uniform, trailing];

			const result = ensureExclusiveBasicChunk(chunks, 3, makeCompressor());

			assert.equal(result, locateNodeInChunks(chunks, 3).chunk);
			assert.equal(result.value, 2);
			assert.equal(chunks[0], leading);
			assert.equal(chunks.at(-1), trailing);
			assert.equal(uniform.isUnreferenced(), true);
			assert.deepEqual(valuesFromChunks(chunks), [-1, 0, 1, 2, 3]);
		});

		for (const shared of [false, true]) {
			for (const index of [0, 100_000, 199_999]) {
				it(`isolates node ${index} in a large ${shared ? "shared" : "unshared"} uniform chunk`, () => {
					const values = makeArray(200_000, (value) => value);
					const uniform = new UniformChunk(
						numberShape.withTopLevelLength(values.length),
						values,
					);
					if (shared) {
						uniform.referenceAdded();
					}
					const chunks: TreeChunk[] = [uniform];

					const result = ensureExclusiveBasicChunk(chunks, index, makeCompressor());

					assert.equal(result.value, index);
					assert.equal(result.isShared(), false);
					assert.equal(locateNodeInChunks(chunks, index).chunk, result);
					assert.equal(chunks.filter((chunk) => chunk instanceof BasicChunk).length, 1);
					assert(chunks.some((chunk) => chunk instanceof UniformChunk));
					assert.deepEqual(valuesFromChunks(chunks), values);
					assert.equal(uniform.isUnreferenced(), !shared);
					if (shared) {
						assert.equal(uniform.isShared(), false);
						assert.deepEqual(valuesFromChunks([uniform]), values);
						uniform.referenceRemoved();
					}
					for (const chunk of chunks) {
						chunk.referenceRemoved();
					}
				});
			}
		}

		it("handles large splits when the policy cannot preserve uniform chunks", () => {
			const values = makeArray(200_000, (value) => value);
			const uniform = new UniformChunk(numberShape.withTopLevelLength(values.length), values);
			const chunks: TreeChunk[] = [uniform];

			const result = ensureExclusiveBasicChunk(chunks, 100_000, {
				policy: defaultChunkPolicy,
				idCompressor: undefined,
			});

			assert.equal(result.value, 100_000);
			assert.equal(result.isShared(), false);
			assert.equal(uniform.isUnreferenced(), true);
			assert.deepEqual(valuesFromChunks(chunks), values);
			for (const chunk of chunks) {
				chunk.referenceRemoved();
			}
		});

		it("normalizes a shared SequenceChunk without replacing a sibling", () => {
			const sequence = new SequenceChunk([
				new BasicChunk(numberShape.type, new Map(), 0),
				new BasicChunk(numberShape.type, new Map(), 1),
				new BasicChunk(numberShape.type, new Map(), 2),
			]);
			sequence.referenceAdded();
			const chunks: TreeChunk[] = [sequence];

			const result = ensureExclusiveBasicChunk(chunks, 2, makeCompressor());

			assert.equal(result, chunks[2]);
			assert.equal(result.value, 2);
			assert.equal(result.isShared(), false);
			assert.deepEqual(valuesFromChunks(chunks), [0, 1, 2]);
		});
	});
});
