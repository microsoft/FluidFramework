/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type DeltaVisitor,
	type FieldKey,
	type TreeChunk,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
	type TreeStoredSchemaSubscription,
	TreeStoredSchemaRepository,
	rootFieldKey,
} from "../../../core/index.js";
import {
	type IChunker,
	type ShapeInfo,
	Chunker,
	defaultChunkPolicy,
	makeTreeChunker,
	polymorphic,
	tryShapeFromNodeSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
// eslint-disable-next-line import-x/no-internal-modules
import { buildChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest.js";
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
} from "../../../feature-libraries/index.js";
import {
	SchemaFactory,
	numberSchema,
	stringSchema,
	toInitialSchema,
} from "../../../simple-tree/index.js";
import { brand, makeArray } from "../../../util/index.js";
import { testForest } from "../../forestTestSuite.js";

const chunkers: [string, (schema: TreeStoredSchemaSubscription) => IChunker][] = [
	[
		"basic",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				Number.POSITIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				0,
				defaultChunkPolicy.uniformChunkNodeCountDynamicTargetMax,
				() => polymorphic,
			),
	],
	[
		"default",
		(schema) => makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
	],
	[
		"sequences",
		(schema): IChunker =>
			new Chunker(schema, defaultSchemaPolicy, 2, 1, 0, 0, (): ShapeInfo => polymorphic),
	],
	[
		"minimal-uniform",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				Number.POSITIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				1,
				0,
				(
					type: TreeNodeSchemaIdentifier,
					shapes: Map<TreeNodeSchemaIdentifier, ShapeInfo>,
					chunkerSchema: TreeStoredSchema,
				) =>
					tryShapeFromNodeSchema(
						{
							schema: chunkerSchema,
							policy: defaultSchemaPolicy,
							shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
							shapes,
						},
						type,
					),
			),
	],
	[
		"uniform",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				Number.POSITIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				defaultChunkPolicy.uniformChunkNodeCount,
				defaultChunkPolicy.uniformChunkNodeCountDynamicTargetMax,
				(
					type: TreeNodeSchemaIdentifier,
					shapes: Map<TreeNodeSchemaIdentifier, ShapeInfo>,
					chunkerSchema: TreeStoredSchema,
				) =>
					tryShapeFromNodeSchema(
						{
							schema: chunkerSchema,
							policy: defaultSchemaPolicy,
							shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
							shapes,
						},
						type,
					),
			),
	],
	[
		"mixed",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				2,
				1,
				defaultChunkPolicy.uniformChunkNodeCount,
				defaultChunkPolicy.uniformChunkNodeCountDynamicTargetMax,
				(
					type: TreeNodeSchemaIdentifier,
					shapes: Map<TreeNodeSchemaIdentifier, ShapeInfo>,
					chunkerSchema: TreeStoredSchema,
				) =>
					tryShapeFromNodeSchema(
						{
							schema: chunkerSchema,
							policy: defaultSchemaPolicy,
							shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
							shapes,
						},
						type,
					),
			),
	],
];

describe("Chunker", () => {
	class TestSchema extends TreeStoredSchemaRepository {
		public hasAfterSchemaChangeListeners(): boolean {
			return this._events.hasListeners("afterSchemaChange");
		}
	}

	it("maintains one schema listener for the current cache contents", () => {
		const schema = new TestSchema();
		let shapeComputations = 0;
		const chunker = new Chunker(
			schema,
			defaultSchemaPolicy,
			Number.POSITIVE_INFINITY,
			Number.POSITIVE_INFINITY,
			0,
			0,
			() => {
				shapeComputations += 1;
				return polymorphic;
			},
		);
		const firstType = brand<TreeNodeSchemaIdentifier>("first");
		const secondType = brand<TreeNodeSchemaIdentifier>("second");

		chunker.shapeFromSchema(firstType);
		chunker.shapeFromSchema(firstType);
		assert.equal(shapeComputations, 1);
		chunker.shapeFromSchema(secondType);
		assert.equal(shapeComputations, 2);
		assert.equal(schema.hasAfterSchemaChangeListeners(), true);

		schema.apply(schema);
		assert.equal(schema.hasAfterSchemaChangeListeners(), false);

		chunker.shapeFromSchema(firstType);
		assert.equal(shapeComputations, 3);
		assert.equal(schema.hasAfterSchemaChangeListeners(), true);
		chunker.dispose();
		assert.equal(schema.hasAfterSchemaChangeListeners(), false);
	});
});

/**
 * Forest visitor and storage-policy integration coverage.
 * Direct helper tests live in chunkEditing.spec.ts and chunkEditTraversal.spec.ts;
 * those suites cover lookup, normalization, and generic splicing independently of forest dispatch.
 */
describe("ChunkedForest", () => {
	for (const [name, chunker] of chunkers) {
		describe(name, () => {
			testForest({
				factory: (schema) => buildChunkedForest(chunker(schema)),
				skipCursorErrorCheck: true,
			});
		});
	}

	/** Shape used to construct the uniform chunks in these tests. */
	const numberShape = new TreeShape(
		brand<TreeNodeSchemaIdentifier>(numberSchema.identifier),
		true,
		[],
	);

	describe("uniform editing", () => {
		const schemaFactory = new SchemaFactory("uniform-edit-tests");
		// The schema permits both fast-path edits and shape changes: x can change type, and absent z can be inserted.
		const Inner = schemaFactory.object("Inner", {
			x: [schemaFactory.number, schemaFactory.string],
			y: schemaFactory.number,
			z: schemaFactory.optional(schemaFactory.number),
		});
		const Outer = schemaFactory.object("Outer", { child: Inner, other: schemaFactory.number });
		const childKey: FieldKey = brand("child");
		const xKey: FieldKey = brand("x");
		const yKey: FieldKey = brand("y");
		const zKey: FieldKey = brand("z");
		const innerShape = new TreeShape(brand(Inner.identifier), false, [
			[xKey, numberShape, 1],
			[yKey, numberShape, 1],
		]);
		const outerShape = new TreeShape(brand(Outer.identifier), false, [
			[childKey, innerShape, 1],
			[brand("other"), numberShape, 1],
		]);
		const source: FieldKey = brand("incoming");
		const destination: FieldKey = brand("outgoing");

		/**
		 * Seeds known uniform storage despite the polymorphic schema, so tests exercise editing rather than chunking heuristics.
		 */
		function setup() {
			const schema = new TreeStoredSchemaRepository(toInitialSchema(Outer));
			const forest = buildChunkedForest(
				makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
			);
			// Each outer node contributes [child.x, child.y, other]; the middle node's x occupies value slot 3.
			const uniform = new UniformChunk(
				outerShape.withTopLevelLength(3),
				[1, 2, 3, 4, 5, 6, 7, 8, 9],
			);
			forest.roots.fields.set(rootFieldKey, [uniform]);
			return { forest, uniform };
		}

		/**
		 * Builds detached incoming content through the visitor, which acquires its own storage from the borrowed cursor.
		 */
		function create(
			visitor: DeltaVisitor,
			value: number | string,
			field: FieldKey = source,
		): void {
			const chunk = new BasicChunk(
				brand(typeof value === "number" ? numberSchema.identifier : stringSchema.identifier),
				new Map(),
				value,
			);
			const cursor = chunk.cursor();
			cursor.enterNode(0);
			visitor.create([cursor], field);
			// Release only the temporary source's reference, not the content now owned by the forest.
			chunk.referenceRemoved();
		}

		/**
		 * Selects the middle outer node's inline child, leaving uniform siblings on both sides of any fallback conversion.
		 */
		function enterInner(visitor: DeltaVisitor): void {
			visitor.enterField(rootFieldKey);
			visitor.enterNode(1);
			visitor.enterField(childKey);
			visitor.enterNode(0);
		}

		/**
		 * Unwinds the logical path even when an edit has changed its physical chunk boundaries.
		 */
		function exitInner(visitor: DeltaVisitor): void {
			visitor.exitNode(0);
			visitor.exitField(childKey);
			visitor.exitNode(1);
			visitor.exitField(rootFieldKey);
			visitor.free();
		}

		for (const shared of [false, true]) {
			it(`preserves representation and exclusive ownership during navigation (shared: ${shared})`, () => {
				const { forest, uniform } = setup();
				const edited = shared ? forest.clone(forest.schema) : forest;
				const visitor = edited.acquireVisitor();
				enterInner(visitor);
				// No edit has occurred: navigation alone must ensure exclusive ownership without converting representation.
				const current = edited.roots.fields.get(rootFieldKey)?.[0];
				assert(current instanceof UniformChunk);
				assert.equal(current === uniform, !shared);
				assert.equal(current.isShared(), false);
				assert.equal(current.shape, uniform.shape);
				assert.equal(current.values === uniform.values, !shared);
				// Entering an inline leaf must reuse the already-exclusive containing chunk rather than clone it again.
				visitor.enterField(xKey);
				visitor.enterNode(0);
				visitor.exitNode(0);
				visitor.exitField(xKey);
				exitInner(visitor);
				assert.equal(edited.roots.fields.get(rootFieldKey)?.[0], current);
			});

			it(`replaces nested leaves in place and retains outgoing values (shared: ${shared})`, () => {
				const { forest, uniform } = setup();
				const originalValues = [...uniform.values];
				const edited = shared ? forest.clone(forest.schema) : forest;
				const visitor = edited.acquireVisitor();
				create(visitor, 99);
				enterInner(visitor);
				const current = edited.roots.fields.get(rootFieldKey)?.[0];
				assert(current instanceof UniformChunk);
				// Capture identities after navigation's copy-on-write, isolating whether replacement itself reallocates storage.
				const values = current.values;
				visitor.enterField(xKey);
				visitor.replace(source, { start: 0, end: 1 }, destination, { minor: 0 });
				visitor.exitField(xKey);
				exitInner(visitor);
				assert.equal(edited.roots.fields.get(rootFieldKey)?.[0], current);
				assert.equal(current === uniform, !shared);
				assert.equal(current.values, values);
				assert.deepEqual(current.values, [1, 2, 3, 99, 5, 6, 7, 8, 9]);
				assert.equal(edited.roots.fields.has(source), false);
				const outgoing = edited.roots.fields.get(destination)?.[0];
				assert(outgoing instanceof UniformChunk);
				// Replacement preserves the old value as detached content; it is not just a scalar overwrite.
				assert.deepEqual(outgoing.values, [4]);
				if (shared) {
					assert.deepEqual(uniform.values, originalValues);
					assert.equal(uniform.isShared(), false);
				}
			});
		}

		it("copies a uniform child when only its BasicChunk ancestor is shared", () => {
			const { forest, uniform } = setup();
			// Transfer the root field's existing uniform reference into a synthetic parent to isolate ownership propagation.
			// This directly constructed wrapper is not part of the schema; no schema-dependent edit targets the wrapper.
			const parent = new BasicChunk(brand("parent"), new Map([[childKey, [uniform]]]));
			forest.roots.fields.set(rootFieldKey, [parent]);
			const edited = forest.clone(forest.schema);
			// Sharing is initially only visible at the forest root. Cloning ancestors must expose the child's sharing before it is edited.
			assert.equal(uniform.isShared(), false);
			const visitor = edited.acquireVisitor();
			create(visitor, 99);
			visitor.enterField(rootFieldKey);
			visitor.enterNode(0);
			visitor.enterField(childKey);
			visitor.enterNode(1);
			visitor.enterField(childKey);
			visitor.enterNode(0);
			visitor.enterField(xKey);
			visitor.replace(source, { start: 0, end: 1 }, destination, { minor: 0 });
			visitor.exitField(xKey);
			visitor.exitNode(0);
			visitor.exitField(childKey);
			visitor.exitNode(1);
			visitor.exitField(childKey);
			visitor.exitNode(0);
			visitor.exitField(rootFieldKey);
			visitor.free();
			const editedParent = edited.roots.fields.get(rootFieldKey)?.[0];
			assert(editedParent instanceof BasicChunk);
			assert.notEqual(editedParent, parent);
			const editedUniform = editedParent.fields.get(childKey)?.[0];
			assert(editedUniform instanceof UniformChunk);
			assert.notEqual(editedUniform, uniform);
			assert.deepEqual(editedUniform.values, [1, 2, 3, 99, 5, 6, 7, 8, 9]);
			assert.deepEqual(uniform.values, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
		});

		it("falls back for a type change and can continue editing the same parent", () => {
			const { forest, uniform } = setup();
			const visitor = forest.acquireVisitor();
			create(visitor, "changed");
			enterInner(visitor);
			visitor.enterField(xKey);
			visitor.replace(source, { start: 0, end: 1 }, destination, { minor: 0 });
			visitor.exitField(xKey);
			// The type change replaced the active uniform cursor. A second edit tests the rebuilt traversal state, not just the first edit's result.
			create(visitor, 100);
			visitor.enterField(yKey);
			visitor.replace(source, { start: 0, end: 1 }, brand("outgoingY"), { minor: 1 });
			visitor.exitField(yKey);
			exitInner(visitor);
			const roots = forest.roots.fields.get(rootFieldKey);
			assert(roots !== undefined);
			assert.deepEqual(
				roots.map((chunk) => chunk.topLevelLength),
				[1, 1, 1],
			);
			// Only the edited middle node and its parent path need BasicChunks; untouched siblings keep their known uniform shapes.
			assert(roots[0] instanceof UniformChunk);
			assert(roots[2] instanceof UniformChunk);
			assert(roots[1] instanceof BasicChunk);
			const inner = roots[1].fields.get(childKey)?.[0];
			assert(inner instanceof BasicChunk);
			const cursor = inner.cursor();
			cursor.enterNode(0);
			cursor.enterField(xKey);
			cursor.enterNode(0);
			assert.equal(cursor.value, "changed");
			cursor.exitNode();
			cursor.exitField();
			cursor.enterField(yKey);
			cursor.enterNode(0);
			assert.equal(cursor.value, 100);
			assert.equal(uniform.isUnreferenced(), true);
		});

		it("preserves earlier in-place changes when a later insertion requires conversion", () => {
			const { forest } = setup();
			const visitor = forest.acquireVisitor();
			create(visitor, 99);
			enterInner(visitor);
			visitor.enterField(xKey);
			visitor.replace(source, { start: 0, end: 1 }, destination, { minor: 0 });
			visitor.exitField(xKey);
			// Adding absent z forces conversion after x was edited in place. Conversion must read current values, not the original snapshot.
			create(visitor, 100);
			visitor.enterField(zKey);
			visitor.attach(source, 1, 0);
			visitor.exitField(zKey);
			exitInner(visitor);
			const cursor = forest.allocateCursor();
			forest.tryMoveCursorToField({ fieldKey: rootFieldKey, parent: undefined }, cursor);
			cursor.enterNode(1);
			cursor.enterField(childKey);
			cursor.enterNode(0);
			cursor.enterField(xKey);
			cursor.enterNode(0);
			assert.equal(cursor.value, 99);
			cursor.exitNode();
			cursor.exitField();
			cursor.enterField(zKey);
			cursor.enterNode(0);
			assert.equal(cursor.value, 100);
			cursor.free();
		});

		for (const compatible of [false, true]) {
			it(`dispatches a replacement in a shared uniform child (compatible: ${compatible})`, () => {
				const { forest } = setup();
				for (const chunk of forest.roots.fields.get(rootFieldKey) ?? []) {
					chunk.referenceRemoved();
				}
				const uniform = new UniformChunk(numberShape.withTopLevelLength(4), [0, 1, 2, 3]);
				forest.roots.fields.set(rootFieldKey, [uniform]);
				const snapshot = forest.clone(forest.schema);
				const visitor = forest.acquireVisitor();
				create(visitor, compatible ? 99 : "changed");
				visitor.enterField(rootFieldKey);
				visitor.replace(source, { start: 2, end: 3 }, destination, { minor: 0 });
				visitor.exitField(rootFieldKey);
				visitor.free();
				assert.equal(snapshot.roots.fields.get(rootFieldKey)?.[0], uniform);
				assert.deepEqual(uniform.values, [0, 1, 2, 3]);
				assert.equal(uniform.isShared(), false);
				assert.equal(uniform.isUnreferenced(), false);
				const chunks = forest.roots.fields.get(rootFieldKey);
				assert(chunks !== undefined);
				if (compatible) {
					assert.equal(chunks.length, 1);
					assert(chunks[0] instanceof UniformChunk);
					assert.notEqual(chunks[0], uniform);
					assert.deepEqual(chunks[0].values, [0, 1, 99, 3]);
				} else {
					// A declined uniform probe must leave the parent able to apply the complete edit through BasicChunk.
					const cursor = forest.allocateCursor();
					forest.tryMoveCursorToField({ fieldKey: rootFieldKey, parent: undefined }, cursor);
					cursor.enterNode(2);
					assert.equal(cursor.value, "changed");
					cursor.free();
				}
				const outgoing = forest.roots.fields.get(destination)?.[0];
				assert(outgoing instanceof UniformChunk);
				assert.deepEqual(outgoing.values, [2]);
			});
		}

		it("retains a top-level uniform leaf sequence during replacement", () => {
			const { forest } = setup();
			const uniform = new UniformChunk(numberShape.withTopLevelLength(4), [0, 1, 2, 3]);
			// Replace the fixture's owned storage with a leaf sequence; the visitor edits its BasicChunk parent without entering the leaf chunk.
			for (const chunk of forest.roots.fields.get(rootFieldKey) ?? []) {
				chunk.referenceRemoved();
			}
			forest.roots.fields.set(rootFieldKey, [uniform]);
			const visitor = forest.acquireVisitor();
			create(visitor, 99);
			visitor.enterField(rootFieldKey);
			visitor.replace(source, { start: 2, end: 3 }, destination, { minor: 0 });
			visitor.exitField(rootFieldKey);
			visitor.free();
			assert.deepEqual(forest.roots.fields.get(rootFieldKey), [uniform]);
			assert.deepEqual(uniform.values, [0, 1, 99, 3]);
		});
	});

	// See testForest for general purpose acquireVisitor tests
	describe("acquireVisitor optimizations", () => {
		function setupForest() {
			const schema = new TreeStoredSchemaRepository(toInitialSchema(SchemaFactory.number));
			return buildChunkedForest(
				makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
			);
		}

		it("retains an exclusively owned root across visitor acquisitions", () => {
			const forest = setupForest();
			const root = forest.roots;

			for (let i = 0; i < 2; i++) {
				forest.acquireVisitor().free();
				assert.equal(forest.roots, root);
				assert.equal(root.isShared(), false);
				assert.equal(root.isUnreferenced(), false);
			}
		});

		for (const editClone of [false, true]) {
			it(`releases the old root when editing the ${editClone ? "clone" : "original"}`, () => {
				const forest = setupForest();
				const root = forest.roots;
				const child = new BasicChunk(numberShape.type, new Map(), 0);
				root.fields.set(rootFieldKey, [child]);
				const clone = forest.clone(forest.schema);
				assert.equal(clone.roots, root);
				assert.equal(root.isShared(), true);

				const edited = editClone ? clone : forest;
				const remaining = editClone ? forest : clone;
				const visitor = edited.acquireVisitor();
				visitor.destroy(rootFieldKey, 1);
				visitor.free();

				assert.notEqual(edited.roots, root);
				assert.equal(edited.roots.isShared(), false);
				assert.equal(edited.roots.isUnreferenced(), false);
				assert.equal(edited.isEmpty, true);
				assert.equal(remaining.roots, root);
				assert.equal(root.isShared(), false);
				assert.equal(root.isUnreferenced(), false);
				assert.deepEqual(root.fields.get(rootFieldKey), [child]);
				assert.equal(child.isShared(), false);
				assert.equal(child.isUnreferenced(), false);

				const remainingVisitor = remaining.acquireVisitor();
				// The child should now be exclusively owned by the remaining forest.
				remainingVisitor.enterField(rootFieldKey);
				remainingVisitor.enterNode(0);
				remainingVisitor.exitNode(0);
				remainingVisitor.exitField(rootFieldKey);
				remainingVisitor.free();

				assert.equal(remaining.roots, root);
				assert.equal(root.fields.get(rootFieldKey)?.[0], child);
				assert.equal(child.isShared(), false);
			});
		}

		it("eagerly copies the root if and only if the root is shared", () => {
			const forest = setupForest();
			const root = forest.roots;
			const firstClone = forest.clone(forest.schema);
			const secondClone = forest.clone(forest.schema);

			firstClone.acquireVisitor().free();
			assert.notEqual(firstClone.roots, root);
			assert.equal(firstClone.roots.isShared(), false);
			assert.equal(root.isShared(), true);

			secondClone.acquireVisitor().free();
			assert.notEqual(secondClone.roots, root);
			assert.notEqual(secondClone.roots, firstClone.roots);
			assert.equal(secondClone.roots.isShared(), false);
			assert.equal(root.isShared(), false);
			assert.equal(root.isUnreferenced(), false);

			forest.acquireVisitor().free();
			assert.equal(forest.roots, root);
			assert.equal(root.isUnreferenced(), false);
		});
	});

	describe("mutation of chunks array inside a multi-node chunkShape", () => {
		/** Field key for the detached field used as the source/destination of attach/detach ops. */
		const detachedKey: FieldKey = brand("detached");

		/** Detached field id paired with `detachedKey`. */
		const detachedId = { minor: 0 };

		/**
		 * Builds a fresh chunked forest for use in a single test case.
		 *
		 * @returns A chunked forest with a root field containing a single uniform chunk of 5 numbers.
		 */
		function setupForest() {
			const forestSchema = new TreeStoredSchemaRepository(
				toInitialSchema(SchemaFactory.number),
			);
			const chunker = makeTreeChunker(
				forestSchema,
				defaultSchemaPolicy,
				defaultIncrementalEncodingPolicy,
			);
			const forest = buildChunkedForest(chunker);

			const uniform = new UniformChunk(numberShape.withTopLevelLength(5), [0, 1, 2, 3, 4]);
			forest.roots.fields.set(rootFieldKey, [uniform]);

			return forest;
		}

		/**
		 * Sums the top-level lengths of the given chunks.
		 *
		 * @param chunks - The chunks to sum.
		 * @returns The total number of top-level nodes across the given `chunks`.
		 */
		function nodeCount(chunks: readonly TreeChunk[]): number {
			return chunks.reduce((runningTotal, chunk) => runningTotal + chunk.topLevelLength, 0);
		}

		it("detaches a single node from the middle of a uniform chunk", () => {
			const forest = setupForest();

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.detach({ start: 2, end: 3 }, detachedKey, detachedId, false);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const detached = forest.roots.fields.get(detachedKey);
			assert(detached !== undefined);
			assert.equal(detached.length, 1);
			const cursor = detached[0].cursor();
			cursor.firstNode();
			assert.equal(cursor.value, 2);

			const remaining = forest.roots.fields.get(rootFieldKey);
			assert(remaining !== undefined);
			assert.equal(nodeCount(remaining), 4);
		});

		it("enterNode resolves the correct chunk in a field with multiple multi-node chunks", () => {
			const forestSchema = new TreeStoredSchemaRepository(
				toInitialSchema(SchemaFactory.number),
			);
			const chunker = makeTreeChunker(
				forestSchema,
				defaultSchemaPolicy,
				defaultIncrementalEncodingPolicy,
			);
			const forest = buildChunkedForest(chunker);
			forest.roots.fields.set(rootFieldKey, [
				new UniformChunk(numberShape.withTopLevelLength(2), [0, 1]),
				new UniformChunk(numberShape.withTopLevelLength(5), [2, 3, 4, 5, 6]),
				new UniformChunk(numberShape.withTopLevelLength(3), [7, 8, 9]),
			]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.enterNode(6);
			visitor.exitNode(6);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const result = forest.roots.fields.get(rootFieldKey);
			assert(result !== undefined);
			assert.deepEqual(
				result.map((chunk) => chunk.topLevelLength),
				[2, 5, 3],
			);
			assert(result[0] instanceof UniformChunk);
			assert(result[1] instanceof UniformChunk);
			assert.equal(result[1].values[4], 6);
			assert(result[2] instanceof UniformChunk);
		});

		it("enterNode preserves shared SequenceChunk structure and untouched siblings", () => {
			const forestSchema = new TreeStoredSchemaRepository(
				toInitialSchema(SchemaFactory.number),
			);
			const forest = buildChunkedForest(
				makeTreeChunker(forestSchema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
			);
			forest.roots.fields.set(rootFieldKey, [
				new SequenceChunk([
					new BasicChunk(numberShape.type, new Map(), 0),
					new BasicChunk(numberShape.type, new Map(), 1),
					new BasicChunk(numberShape.type, new Map(), 2),
				]),
			]);
			// Cloning shares the root and its descendants, forcing enterNode's copy-on-write path.
			const clone = forest.clone(forestSchema);

			const visitor = clone.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.enterNode(2);
			visitor.exitNode(2);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const result = clone.roots.fields.get(rootFieldKey);
			assert(result !== undefined);
			assert.equal(result.length, 1);
			const sequence = result[0];
			const original = forest.roots.fields.get(rootFieldKey)?.[0];
			assert(sequence instanceof SequenceChunk);
			assert(original instanceof SequenceChunk);
			assert.notEqual(sequence, original);
			assert.equal(sequence.subChunks[0], original.subChunks[0]);
			assert.equal(sequence.subChunks[1], original.subChunks[1]);
			assert.notEqual(sequence.subChunks[2], original.subChunks[2]);
			assert.deepEqual(
				sequence.subChunks.map((chunk) => {
					const cursor = chunk.cursor();
					assert(cursor.firstNode());
					return cursor.value;
				}),
				[0, 1, 2],
			);
		});

		it("attaches a single node into the middle of a uniform chunk", () => {
			const forest = setupForest();

			// Stage a source chunk in the detached field to be attached into the middle of root.
			const source = new UniformChunk(numberShape.withTopLevelLength(1), [99]);
			forest.roots.fields.set(detachedKey, [source]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.attach(detachedKey, 1, 2);
			visitor.exitField(rootFieldKey);
			visitor.free();

			// The source detached field should be consumed.
			assert.equal(forest.roots.fields.get(detachedKey), undefined);

			// The root field should now hold 6 nodes, with 99 landing at index 2.
			const updated = forest.roots.fields.get(rootFieldKey);
			assert(updated !== undefined);
			assert.equal(nodeCount(updated), 6);

			const values: unknown[] = [];
			for (const chunk of updated) {
				const cursor = chunk.cursor();
				for (let hasNode = cursor.firstNode(); hasNode; hasNode = cursor.nextNode()) {
					values.push(cursor.value);
				}
			}
			assert.deepEqual(values, [0, 1, 99, 2, 3, 4]);
		});

		/**
		 * Seeds the forest's root field with a sequence of single-shape UniformChunks of the given sizes.
		 *
		 * @remarks
		 * Lets tests position attach/detach boundaries on existing chunk seams and exercise
		 * `coalesceUniformChunks` without `splitFieldAtIndex` having to bisect first.
		 */
		function setupForestWithChunks(
			chunkSizes: readonly number[],
		): ReturnType<typeof setupForest> {
			const forestSchema = new TreeStoredSchemaRepository(
				toInitialSchema(SchemaFactory.number),
			);
			const chunker = makeTreeChunker(
				forestSchema,
				defaultSchemaPolicy,
				defaultIncrementalEncodingPolicy,
			);
			const forest = buildChunkedForest(chunker);
			let nextValue = 0;
			const chunks: TreeChunk[] = chunkSizes.map(
				(size) =>
					new UniformChunk(
						numberShape.withTopLevelLength(size),
						makeArray(size, () => nextValue++),
					),
			);
			forest.roots.fields.set(rootFieldKey, chunks);
			return forest;
		}

		it("coalesces same-shape neighbors left adjacent by an aligned detach", () => {
			// Field pre-arranged as three same-shape UniformChunks of sizes 2, 1, 2 so the
			// detach lands on existing chunk boundaries — splitFieldAtIndex is a no-op and
			// only coalesceUniformChunks is exercised. After removing the middle single-node
			// chunk, the two 2-node chunks merge into a single 4-node chunk.
			const forest = setupForestWithChunks([2, 1, 2]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.detach({ start: 2, end: 3 }, detachedKey, detachedId, false);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const remaining = forest.roots.fields.get(rootFieldKey);
			assert(remaining !== undefined);
			assert.equal(remaining.length, 1);
			assert(remaining[0] instanceof UniformChunk);
			assert.equal(remaining[0].topLevelLength, 4);
		});

		it("enterNode resolves the correct chunk in a field with multiple multi-node chunks", () => {
			// Regression test for a chunk-walk bug in enterNode. Previously, the loop that
			// walks chunks to find the target index read its `chunk` variable at the top of
			// the loop body — before `indexOfChunk++` — so the next iteration's condition
			// check used the prior iteration's chunk. With fields containing multiple
			// multi-node UniformChunks (as produced by coalesceUniformChunks in steady state),
			// this caused the loop to overshoot the target chunk.
			//
			// Setup: three same-shape UniformChunks of sizes 2, 5, 3 — 10 total nodes.
			// enterNode(6) targets the 5-node chunk at local position 4 (global indices 2..6
			// land in that chunk). Pre-fix, the loop steps past the 5-node chunk and lands on
			// the 3-node chunk with indexWithinChunk = -1, throwing "Array index is out of
			// bounds" when dereferencing newChunks[-1].
			const forest = setupForestWithChunks([2, 5, 3]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.enterNode(6);
			visitor.exitNode(6);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const result = forest.roots.fields.get(rootFieldKey);
			assert(result !== undefined);
			assert.deepEqual(
				result.map((chunk) => chunk.topLevelLength),
				[2, 5, 3],
			);
			assert(result[0] instanceof UniformChunk);
			assert(result[1] instanceof UniformChunk);
			assert.equal(result[1].values[4], 6);
			assert(result[2] instanceof UniformChunk);
		});

		it("coalesces an inserted same-shape chunk with its neighbors", () => {
			// Field pre-arranged as two same-shape 2-node UniformChunks so the attach lands
			// on the existing seam — splitFieldAtIndex is a no-op. After inserting a
			// single-node UniformChunk with value 99 at index 2, coalesce merges both seams
			// into a single 5-node UniformChunk.
			const forest = setupForestWithChunks([2, 2]);
			const source = new UniformChunk(numberShape.withTopLevelLength(1), [99]);
			forest.roots.fields.set(detachedKey, [source]);

			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			visitor.attach(detachedKey, 1, 2);
			visitor.exitField(rootFieldKey);
			visitor.free();

			const updated = forest.roots.fields.get(rootFieldKey);
			assert(updated !== undefined);
			assert.equal(updated.length, 1);
			assert(updated[0] instanceof UniformChunk);
			assert.equal(updated[0].topLevelLength, 5);
		});

		it("releases chunks when destroying a detached field", () => {
			const forest = setupForest();
			const source = new UniformChunk(numberShape.withTopLevelLength(1), [99]);
			forest.roots.fields.set(detachedKey, [source]);

			const visitor = forest.acquireVisitor();
			visitor.destroy(detachedKey, 1);
			visitor.free();

			assert.equal(forest.roots.fields.has(detachedKey), false);
			// The removed field owned the chunk's only reference.
			assert.equal(source.isUnreferenced(), true);
		});
	});
});
