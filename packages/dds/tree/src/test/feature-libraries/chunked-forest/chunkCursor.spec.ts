/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	CursorLocationType,
	clonePath,
	type FieldKey,
} from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
import {
	ChunkCursor,
	ChunkSequenceCursor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkCursor.js";
// eslint-disable-next-line import-x/no-internal-modules
import { dummyRoot } from "../../../feature-libraries/chunked-forest/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import type { TreeChunk } from "../../../feature-libraries/index.js";
import { numberSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";

import {
	numberSequenceField,
	numericBasicChunk,
	validateChunkCursor,
	WrapperChunk,
} from "./fieldCursorTestUtilities.js";

/**
 * Shared ChunkTraversal/ChunkCursor navigation and ChunkSequenceCursor's field-only contract.
 * SequenceChunk cursor integration is intentionally covered here, alongside mixed-format and nested-sequence traversal.
 * BasicChunk and UniformChunk cursor conformance suites remain in basicChunk.spec.ts and uniformChunk.spec.ts.
 */
describe("chunkCursor", () => {
	describe("ChunkSequenceCursor", () => {
		it("exposes an empty root field without inline-node operations", () => {
			const cursor = new ChunkSequenceCursor([]);
			assert.equal(cursor.mode, CursorLocationType.Fields);
			assert.equal(cursor.atChunkRoot(), true);
			assert.equal(cursor.getFieldLength(), 0);
			assert.deepEqual(cursor.getFieldChunks(), []);
			assert.deepEqual(cursor.getFieldPath(), { parent: undefined, field: dummyRoot });
			assert.equal("enterNode" in cursor, false);
		});

		it("forks borrowed field storage and applies path prefixes", () => {
			const chunk = numericBasicChunk(1);
			const chunks = [chunk];
			const key: FieldKey = brand("field");
			const cursor = new ChunkSequenceCursor(chunks, key);
			const fork = cursor.fork();
			assert.notEqual(fork, cursor);
			assert.equal(fork.getFieldChunks(), chunks);
			assert.equal(fork.getFieldKey(), key);
			assert.equal(fork.getFieldLength(), 1);
			assert.equal(chunk.isShared(), false);
			const parent = { parent: undefined, parentField: dummyRoot, parentIndex: 2 };
			assert.deepEqual(cursor.getFieldPath({ parent, rootFieldOverride: EmptyKey }), {
				parent,
				field: EmptyKey,
			});
			assert.deepEqual(fork.getFieldPath(), { parent: undefined, field: key });
			chunk.referenceRemoved();
		});
	});

	describe("ChunkCursor", () => {
		it("refreshes inline capabilities after reset and releases them on clear without changing forks", () => {
			class ResettableCursor extends ChunkCursor {
				public select(chunk: TreeChunk): void {
					this.reset(new ChunkSequenceCursor([chunk]));
				}

				public clear(): void {
					this.clearTraversal();
				}
			}
			const basic = numericBasicChunk(1);
			const shape = new TreeShape(brand(numberSchema.identifier), true, []);
			const uniform = new UniformChunk(shape.withTopLevelLength(2), [2, 3]);
			const cursor = new ResettableCursor(new ChunkSequenceCursor([basic]));
			assert(cursor.firstNode());
			assert.equal(cursor.value, 1);
			const basicFork = cursor.fork();
			cursor.select(uniform);
			assert.throws(() => cursor.value, /Expected an inline-node adapter/);
			assert(cursor.firstNode());
			assert.equal(cursor.value, 2);
			const uniformFork = cursor.fork();
			cursor.clear();
			assert.throws(() => cursor.value, /Cursor has been freed/);
			assert.equal(basicFork.value, 1);
			assert.equal(uniformFork.value, 2);
			cursor.select(basic);
			assert(cursor.firstNode());
			assert.equal(cursor.value, 1);
			basic.referenceRemoved();
			uniform.referenceRemoved();
		});

		it("atRoot, not nested", () => {
			const chunk: BasicChunk = new BasicChunk(
				brand("Foo"),
				new Map([[EmptyKey, [numericBasicChunk()]]]),
			);
			const cursor = chunk.cursor();
			assert(cursor.atChunkRoot());
			cursor.enterNode(0);
			assert(cursor.atChunkRoot());
			cursor.enterField(EmptyKey);
			assert(!cursor.atChunkRoot());
			cursor.enterNode(0);
			assert(!cursor.atChunkRoot());
		});

		it("atRoot, nested", () => {
			const child0 = numericBasicChunk();
			const child1 = new WrapperChunk(numericBasicChunk());
			const chunk = new SequenceChunk([child0, child1]);
			// The wrapper forwards an ordinary cursor rather than exposing the local-adapter contract.
			const cursor = chunk.cursor();
			assert(cursor.atChunkRoot());
			cursor.enterNode(1);
			assert(cursor.atChunkRoot());
			cursor.enterField(EmptyKey);
			assert(!cursor.atChunkRoot());
		});

		it("getField resolves parent via chunk array index when preceded by a multi-node chunk", () => {
			// A root field with 3 logical nodes split across 2 chunks:
			// chunks[0]: UniformChunk with 2 number nodes.
			// chunks[1]: BasicChunk holding a single subField leaf.
			const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
			const uniform = new UniformChunk(numberShape.withTopLevelLength(2), [10, 20]);

			const subField: FieldKey = brand("subField");
			const subLeaf = new BasicChunk(brand(numberSchema.identifier), new Map(), 42);
			const trailingBasic = new BasicChunk(
				brand("Trailing"),
				new Map([[subField, [subLeaf]]]),
			);

			const cursor = ChunkCursor.fromChunks([uniform, trailingBasic]);

			// Transitions from field to firstNode and then increments to nodeIndex 2,
			// which maps to chunk array index 1 (the trailing BasicChunk).
			cursor.enterNode(2);

			// Entering the subfield of the trailing BasicChunk calls enterField, which is followed by
			// getField, which looks up the current node (whose field we should get). This must
			// handle the case where the index of the node does not match the index of the chunk
			// containing the node in the owning chunk array.
			// In this test, the node index is 2 and the chunk index is 1.
			cursor.enterField(subField);
			// Validates the cursor is positioned on the subField holding the subLeaf,
			// then enters it to confirm its value (42).
			assert.equal(cursor.getFieldLength(), 1);
			cursor.firstNode();
			assert.equal(cursor.value, 42);
		});

		it("getField resolves parent via chunk array index when preceded by two multi-node chunks", () => {
			// Root field with 5 logical nodes across 3 chunks:
			// chunks[0]: UniformChunk with 2 number nodes.
			// chunks[1]: UniformChunk with 2 number nodes.
			// chunks[2]: BasicChunk with a single subField leaf.
			const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
			const uniformA = new UniformChunk(numberShape.withTopLevelLength(2), [10, 20]);
			const uniformB = new UniformChunk(numberShape.withTopLevelLength(2), [30, 40]);

			const subField: FieldKey = brand("subField");
			const subLeaf = new BasicChunk(brand(numberSchema.identifier), new Map(), 99);
			const trailingBasic = new BasicChunk(
				brand("Trailing"),
				new Map([[subField, [subLeaf]]]),
			);

			const cursor = ChunkCursor.fromChunks([uniformA, uniformB, trailingBasic]);

			// Transitions from field to firstNode and then increments to nodeIndex 4,
			// which maps to chunk array index 2 (the trailing BasicChunk).
			cursor.enterNode(4);

			// Entering the subfield of the trailing BasicChunk calls enterField, which is followed by
			// getField, which looks up the current node (whose field we should get). This must
			// handle the case where the index of the node does not match the index of the chunk
			// containing the node in the owning chunk array.
			// In this test, the node index is 4 and the chunk index is 2.
			cursor.enterField(subField);
			// Validates the cursor is positioned on the subField holding the subLeaf,
			// then enters it to confirm its value (99).
			assert.equal(cursor.getFieldLength(), 1);
			cursor.firstNode();
			assert.equal(cursor.value, 99);
		});

		describe("sequence boundaries", () => {
			it("reuses the owning field array while scanning siblings in both directions", () => {
				let fieldLookups = 0;
				class CountedFields extends Map<FieldKey, TreeChunk[]> {
					public override get(key: FieldKey): TreeChunk[] | undefined {
						fieldLookups++;
						return super.get(key);
					}
				}
				const children = Array.from({ length: 100 }, (_, index) => numericBasicChunk(index));
				const root = new BasicChunk(
					brand("parent"),
					new CountedFields([[EmptyKey, children]]),
				);
				const cursor = root.cursor();
				cursor.enterNode(0);
				cursor.enterField(EmptyKey);
				assert(cursor.firstNode());
				for (let index = 0; index < children.length; index++) {
					assert.equal(cursor.value, index);
					assert.equal(cursor.nextNode(), index + 1 < children.length);
				}
				cursor.enterNode(children.length - 1);
				for (let index = children.length - 1; index >= 0; index--) {
					assert.equal(cursor.value, index);
					assert.equal(cursor.seekNodes(-1), index > 0);
				}
				assert(fieldLookups < 10, `Expected bounded field lookups, observed ${fieldLookups}`);
				root.referenceRemoved();
			});

			it("scans sibling chunks with linear length lookups in both directions", () => {
				let lengthReads = 0;
				/** Counts length queries to detect repeated scans of previously visited sibling chunks. */
				class CountedChunk extends WrapperChunk implements TreeChunk {
					public override get topLevelLength(): number {
						lengthReads++;
						return super.topLevelLength;
					}
				}
				const chunks = Array.from({ length: 200 }, (_, index) => {
					const leaf = numericBasicChunk(index);
					const counted = new CountedChunk(leaf);
					leaf.referenceRemoved();
					return counted;
				});
				const root = new SequenceChunk(chunks);
				const cursor = root.cursor();
				assert(cursor.firstNode());
				for (let index = 0; index < chunks.length; index++) {
					assert.equal(cursor.value, index);
					assert.equal(cursor.nextNode(), index + 1 < chunks.length);
				}
				cursor.enterNode(chunks.length - 1);
				for (let index = chunks.length - 1; index >= 0; index--) {
					assert.equal(cursor.value, index);
					assert.equal(cursor.seekNodes(-1), index > 0);
				}
				assert(
					lengthReads < chunks.length * 20,
					`Expected linear traversal, observed ${lengthReads} length reads`,
				);
				root.referenceRemoved();
			});

			it("skips empty sequence chunks across forward and backward boundaries", () => {
				const root = new SequenceChunk([
					new SequenceChunk([]),
					numericBasicChunk(1),
					new SequenceChunk([new SequenceChunk([])]),
					numericBasicChunk(2),
					new SequenceChunk([]),
				]);
				const cursor = root.cursor();
				assert(cursor.firstNode());
				assert.equal(cursor.value, 1);
				assert(cursor.nextNode());
				assert.equal(cursor.value, 2);
				assert(cursor.seekNodes(-1));
				assert.equal(cursor.value, 1);
				assert.equal(cursor.seekNodes(-1), false);
				assert.equal(cursor.getFieldLength(), 2);
				root.referenceRemoved();
			});

			for (const depth of [1, 4, 8, 64]) {
				it(`preserves logical paths and independent forks through ${depth} sequence layers`, () => {
					const key: FieldKey = brand("child");
					const shape = new TreeShape(brand(numberSchema.identifier), true, []);
					let nested: TreeChunk = new SequenceChunk([
						new UniformChunk(shape.withTopLevelLength(2), [10, 20]),
						new BasicChunk(brand("parent"), new Map([[key, [numericBasicChunk(30)]]])),
					]);
					for (let layer = 0; layer < depth; layer++) {
						nested = new SequenceChunk([nested]);
					}
					const root = new SequenceChunk([
						numericBasicChunk(0),
						nested,
						numericBasicChunk(40),
					]);
					const cursor = root.cursor();
					assert.equal(cursor.getFieldLength(), 5);
					cursor.enterNode(2);
					assert.equal(cursor.value, 20);
					assert.equal(cursor.fieldIndex, 2);
					assert.equal(cursor.chunkStart, 1);
					assert.equal(cursor.chunkLength, 2);
					const fork = cursor.fork();
					assert.equal(cursor.nextNode(), true);
					assert.deepEqual(clonePath(cursor.getPath()), {
						parent: undefined,
						parentField: dummyRoot,
						parentIndex: 3,
					});
					cursor.enterField(key);
					cursor.enterNode(0);
					assert.equal(cursor.value, 30);
					assert.deepEqual(clonePath(cursor.getPath()), {
						parent: { parent: undefined, parentField: dummyRoot, parentIndex: 3 },
						parentField: key,
						parentIndex: 0,
					});
					assert.equal(fork.value, 20);
					assert.equal(fork.seekNodes(-2), true);
					assert.equal(fork.value, 0);
					cursor.exitNode();
					cursor.exitField();
					assert.equal(cursor.nextNode(), true);
					assert.equal(cursor.value, 40);
					assert.equal(cursor.nextNode(), false);
					assert.equal(cursor.getFieldLength(), 5);
					root.referenceRemoved();
				});
			}
			it("root", () => {
				validateChunkCursor(new SequenceChunk([numericBasicChunk(0)]), numberSequenceField(1));
				validateChunkCursor(
					new SequenceChunk([numericBasicChunk(0), numericBasicChunk(1)]),
					numberSequenceField(2),
				);
				validateChunkCursor(
					new SequenceChunk([
						numericBasicChunk(0),
						numericBasicChunk(1),
						numericBasicChunk(2),
					]),
					numberSequenceField(3),
				);
			});

			it("nested", () => {
				validateChunkCursor(
					new SequenceChunk([new SequenceChunk([numericBasicChunk(0)])]),
					numberSequenceField(1),
				);
				validateChunkCursor(
					new SequenceChunk([numericBasicChunk(0), new SequenceChunk([numericBasicChunk(1)])]),
					numberSequenceField(2),
				);
				validateChunkCursor(
					new SequenceChunk([
						new SequenceChunk([numericBasicChunk(0)]),
						new SequenceChunk([numericBasicChunk(1)]),
					]),
					numberSequenceField(2),
				);
				validateChunkCursor(
					new SequenceChunk([
						numericBasicChunk(0),
						new SequenceChunk([
							new SequenceChunk([numericBasicChunk(1), numericBasicChunk(2)]),
						]),
					]),
					numberSequenceField(3),
				);
			});

			it("nested at offset", () => {
				validateChunkCursor(
					new SequenceChunk([numericBasicChunk(0), new SequenceChunk([numericBasicChunk(1)])]),
					numberSequenceField(2),
				);
			});

			it("double nested at offset", () => {
				validateChunkCursor(
					new SequenceChunk([
						numericBasicChunk(0),
						new SequenceChunk([new SequenceChunk([numericBasicChunk(1)])]),
					]),
					numberSequenceField(2),
				);
			});
		});
	});
});
