/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkMode,
	BenchmarkType,
	benchmarkDurationBatchless,
	benchmarkDuration,
	benchmarkIt,
	benchmarkMemoryUse,
	currentBenchmarkMode,
	memoryUseOfValue,
	ValueType,
	type CollectedData,
} from "@fluid-tools/benchmark";

import { asAlpha } from "../../../api.js";
import type {
	FieldKey,
	IForestSubscription,
	TreeChunk,
	TreeNodeSchemaIdentifier,
	TreeValue,
} from "../../../core/index.js";
import { EmptyKey, rootFieldKey, TreeStoredSchemaRepository } from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	buildChunkedForest,
	ensureExclusiveBasicChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkedForest.js";
import {
	coalesceUniformChunks,
	makeTreeChunker,
	type ChunkPolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
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
	ForestTypeOptimized,
	createIndependentTreeAlpha,
} from "../../../shared-tree/index.js";
import {
	SchemaFactory,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	booleanSchema,
	numberSchema,
	stringSchema,
	toInitialSchema,
} from "../../../simple-tree/index.js";
import { FormattedText, PlainText } from "../../../text/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import { brand } from "../../../util/index.js";
import { configureBenchmarkHooks, TestTreeProviderLite } from "../../utils.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";

/** Iteration counts for the memory benchmarks (mirrors the shared `iterationSettings` helper). */
const iterationSettings = { keepIterations: 4, warmUpIterations: 2 };

/** Minimal structural view of a chunk that may have child fields, for walking the chunk tree. */
type ChunkWithFields = TreeChunk & { readonly fields?: Map<FieldKey, TreeChunk[]> };

/**
 * `coalesceUniformChunks` only reads `uniformChunkNodeCountDynamicTargetMax` from its policy (the cap on
 * how many nodes a merged chunk may hold). This matches the production default.
 */
const policy = { uniformChunkNodeCountDynamicTargetMax: 25 } as unknown as ChunkPolicy;

// #region Shapes and chunk construction (bypasses simple-tree; builds chunks directly).

/** A single-value leaf built from the `number` primitive: `TreeShape.equals` is trivial (no fields). */
const shallowShape = new TreeShape(
	brand<TreeNodeSchemaIdentifier>(numberSchema.identifier),
	true,
	[],
);

/**
 * A formatted-atom-like shape with a string leaf and five formatting properties.
 * This exercises larger value arrays than the shallow shape.
 * Homogeneous cases reuse the same shape instance, so equality uses its identity fast path rather than traversing these fields.
 */
function makeDeepShape(typeName: string): TreeShape {
	const boolLeaf = new TreeShape(
		brand<TreeNodeSchemaIdentifier>(booleanSchema.identifier),
		true,
		[],
	);
	const numberLeaf = new TreeShape(
		brand<TreeNodeSchemaIdentifier>(numberSchema.identifier),
		true,
		[],
	);
	const stringLeaf = new TreeShape(
		brand<TreeNodeSchemaIdentifier>(stringSchema.identifier),
		true,
		[],
	);
	const formatShape = new TreeShape(
		brand<TreeNodeSchemaIdentifier>("bench.CharacterFormat"),
		false,
		[
			["bold" as FieldKey, boolLeaf, 1],
			["italic" as FieldKey, boolLeaf, 1],
			["underline" as FieldKey, boolLeaf, 1],
			["size" as FieldKey, numberLeaf, 1],
			["font" as FieldKey, stringLeaf, 1],
		],
	);
	return new TreeShape(brand<TreeNodeSchemaIdentifier>(typeName), false, [
		["content" as FieldKey, stringLeaf, 1],
		["format" as FieldKey, formatShape, 1],
	]);
}
// These shapes have identical field layouts but different root types.
// Equality rejects the type mismatch before comparing fields, measuring an unmergeable insertion rather than worst-case comparison cost.
const deepShapeA = makeDeepShape("bench.formattedAtomA");
const deepShapeB = makeDeepShape("bench.formattedAtomB");

const shallowValues = (): TreeValue[] => [97];
const deepValues = (): TreeValue[] => ["a", false, false, false, 12, "Arial"];

function singleNodeChunk(shape: TreeShape, values: TreeValue[]): UniformChunk {
	return new UniformChunk(shape.withTopLevelLength(1), values);
}

/** Builds a single UniformChunk of `nodeCount` same-shape nodes (values repeated per node). */
function multiNodeChunk(
	shape: TreeShape,
	values: () => TreeValue[],
	nodeCount: number,
): UniformChunk {
	const flat: TreeValue[] = [];
	for (let i = 0; i < nodeCount; i++) {
		flat.push(...values());
	}
	return new UniformChunk(shape.withTopLevelLength(nodeCount), flat);
}

/**
 * Splits a UniformChunk into two at `nodeIndex` by slicing its value array — the same operation
 * `splitFieldAtIndex` performs internally when an edit lands inside a multi-node uniform chunk.
 */
function splitUniformChunk(
	chunk: UniformChunk,
	nodeIndex: number,
): [UniformChunk, UniformChunk] {
	const treeShape = chunk.shape.treeShape;
	const valuesPerNode = treeShape.valuesPerTopLevelNode;
	const left = new UniformChunk(
		treeShape.withTopLevelLength(nodeIndex),
		chunk.values.slice(0, nodeIndex * valuesPerNode),
	);
	const right = new UniformChunk(
		treeShape.withTopLevelLength(chunk.topLevelLength - nodeIndex),
		chunk.values.slice(nodeIndex * valuesPerNode),
	);
	return [left, right];
}

/** Builds a field fragmented into `count` single-node UniformChunks of `shape` (the un-coalesced state). */
function buildFragmentedField(
	count: number,
	shape: TreeShape,
	values: () => TreeValue[],
): TreeChunk[] {
	const chunks: TreeChunk[] = [];
	for (let i = 0; i < count; i++) {
		chunks.push(singleNodeChunk(shape, values()));
	}
	return chunks;
}

/** Nodes in the existing chunk that each insert edit splits (kept under the coalescing cap). */
const editChunkNodeCount = 20;

/**
 * Models an insertion into the middle of a uniform chunk by splitting its values and optionally coalescing the result.
 * Matching shapes allow the pieces to merge; the heterogeneous fixture has a different root type and is rejected immediately.
 * This measures chunk construction, value copying, and coalescing, not the forest visitor or application editing APIs.
 */
function insertEdit(
	fieldShape: TreeShape,
	fieldValues: () => TreeValue[],
	insertShape: TreeShape,
	insertValues: () => TreeValue[],
	coalesce: boolean,
): void {
	const existing = multiNodeChunk(fieldShape, fieldValues, editChunkNodeCount);
	const [left, right] = splitUniformChunk(existing, Math.floor(editChunkNodeCount / 2));
	const field: TreeChunk[] = [left, singleNodeChunk(insertShape, insertValues()), right];
	if (coalesce) {
		coalesceUniformChunks(field, policy, { start: 0, end: field.length });
	}
}

// #endregion

// #region Chunk-walking helpers.

/** Visits every chunk reachable from a chunked forest's roots. */
function forEachChunk(forest: IForestSubscription, visit: (chunk: TreeChunk) => void): void {
	const roots = (forest as unknown as { readonly roots: ChunkWithFields }).roots;
	function walk(chunk: TreeChunk): void {
		visit(chunk);
		const fields = (chunk as ChunkWithFields).fields;
		if (fields !== undefined) {
			for (const chunks of fields.values()) {
				for (const child of chunks) {
					walk(child);
				}
			}
		}
	}
	walk(roots);
}

/** Counts every UniformChunk reachable from a chunked forest's roots. */
function countUniformChunks(forest: IForestSubscription): number {
	let count = 0;
	forEachChunk(forest, (chunk) => {
		if (chunk instanceof UniformChunk) {
			count++;
		}
	});
	return count;
}

/**
 * Summarizes the chunk shape of a forest.
 * @returns The total chunk count, non-uniform chunk count, and largest uniform chunk's top-level node count.
 * @remarks
 * Includes the forest's synthetic root and detached content, not just the current document.
 * The `basic` metric counts all non-uniform chunks; these fixtures use no sequence chunks.
 */
function chunkStats(forest: IForestSubscription): {
	total: number;
	basic: number;
	largestUniformNodes: number;
} {
	let total = 0;
	let uniform = 0;
	let largestUniformNodes = 0;
	forEachChunk(forest, (chunk) => {
		total++;
		if (chunk instanceof UniformChunk) {
			uniform++;
			largestUniformNodes = Math.max(largestUniformNodes, chunk.topLevelLength);
		}
	});
	return { total, basic: total - uniform, largestUniformNodes };
}

// #endregion

// #region Application editing fixtures.

/**
 * Reaches the internal forest backing a view. The view is a `SchematizingSimpleTreeView` whose
 * `checkout` exposes the `IForestSubscription`. This is an intentional internal coupling — the public
 * API hides the forest — but these benchmarks need it to inspect chunk storage.
 */
function forestFromView(view: object): IForestSubscription {
	return (view as { readonly checkout: { readonly forest: IForestSubscription } }).checkout
		.forest;
}

/** Types `size` characters one at a time into the middle of an empty chunked-forest document. */
function typeIntoChunkedDocument(size: number): IForestSubscription {
	const view = createIndependentTreeAlpha({ forest: ForestTypeOptimized }).viewWith(
		new TreeViewConfiguration({ schema: PlainText.Tree }),
	);
	view.initialize(PlainText.Tree.fromString(""));
	const root = view.root;
	for (let i = 0; i < size; i++) {
		root.insertAt(Math.floor(root.characterCount() / 2), i % 2 === 0 ? "a" : "b");
	}
	return forestFromView(view);
}

const objectSchemaFactory = new SchemaFactory("bench.chunkedForestCoalescing");
class Row extends objectSchemaFactory.object("Row", { v: objectSchemaFactory.number }) {}
class ObjectArray extends objectSchemaFactory.array("ObjectArray", Row) {}
class Point extends objectSchemaFactory.object("Point", {
	x: objectSchemaFactory.number,
	y: objectSchemaFactory.number,
}) {}
class PointArray extends objectSchemaFactory.array("PointArray", Point) {}

const formatSchemaFactory = new SchemaFactoryBeta("bench.uniformLeafFormatting");
class CharacterFormat extends formatSchemaFactory.object("CharacterFormat", {
	bold: formatSchemaFactory.boolean,
	italic: formatSchemaFactory.boolean,
	underline: formatSchemaFactory.boolean,
	size: formatSchemaFactory.number,
	font: formatSchemaFactory.string,
}) {}
const FormattedDocument = FormattedText.createSchema(
	formatSchemaFactory,
	CharacterFormat,
	[],
	{
		bold: false,
		italic: false,
		underline: false,
		size: 12,
		font: "Arial",
	},
);

const formattedTextLength = currentBenchmarkMode === BenchmarkMode.Performance ? 1000 : 100;

/**
 * An initialized optimized-forest document and a single-use operation to measure.
 * @remarks
 * Fixture creation is outside the timing window; only `edit()` is timed, with `verify()` called afterward.
 * Incoming-edit fixtures prepare the source change during setup, so `edit()` measures its application rather than its creation.
 * The callbacks capture the view, so retaining the complete fixture also retains its editing history.
 */
interface LeafEditFixture {
	readonly forest: IForestSubscription;
	edit(): void;
	verify(): void;
}

/**
 * Prepares a local formatting operation whose timed call includes locating and editing all characters in the range.
 */
function formattedRangeFixture(): LeafEditFixture {
	const view = createIndependentTreeAlpha({ forest: ForestTypeOptimized }).viewWith(
		new TreeViewConfiguration({ schema: FormattedDocument }),
	);
	view.initialize(FormattedDocument.fromString("x".repeat(formattedTextLength)));
	return {
		forest: forestFromView(view),
		edit: () => view.root.formatRange(0, formattedTextLength, { bold: true }),
		verify: () => assert.equal(view.root.getUniformRun(0), formattedTextLength),
	};
}

/**
 * Locates the point during setup so the timed operation measures only its numeric field setter.
 */
function pointCoordinateFixture(): LeafEditFixture {
	const view = createIndependentTreeAlpha({ forest: ForestTypeOptimized }).viewWith(
		new TreeViewConfiguration({ schema: PointArray }),
	);
	view.initialize(
		Array.from({ length: 1000 }, (_, index) => new Point({ x: index, y: index })),
	);
	const point = view.root[500];
	// Retain the resolved node so the timed setter does not also measure array lookup and node materialization.
	return {
		forest: forestFromView(view),
		edit: () => {
			point.x = 1001;
		},
		verify: () => {
			assert.equal(point.x, 1001);
			assert.equal(point.y, 500);
		},
	};
}

/**
 * Reads the known array representation of this benchmark's type-erased formatted-text schema.
 */
function formattedAtoms(root: object): readonly { readonly format: CharacterFormat }[] {
	return (root as { readonly content: readonly { readonly format: CharacterFormat }[] })
		.content;
}

/**
 * Authors formatting on a fork before timing the receiving view's merge, including normal merge cleanup.
 * The receiver has no concurrent local edits, so this is not a conflicting-rebase benchmark.
 */
function formattedBranchFixture(): LeafEditFixture {
	const view = asAlpha(
		createIndependentTreeAlpha({ forest: ForestTypeOptimized }).viewWith(
			new TreeViewConfiguration({ schema: FormattedDocument }),
		),
	);
	view.initialize(FormattedDocument.fromString("x".repeat(formattedTextLength)));
	const branch = view.fork();
	branch.root.formatRange(0, formattedTextLength, { bold: true });
	assert.equal(formattedAtoms(view.root)[0].format.bold, false);
	return {
		forest: forestFromView(view),
		edit: () => view.merge(branch),
		verify: () => {
			assert.equal(view.root.getUniformRun(0), formattedTextLength);
			for (const atom of formattedAtoms(view.root)) {
				assert.equal(atom.format.bold, true);
			}
		},
	};
}

/**
 * Prepares a point edit on a fork with the same merge-only timing boundary as {@link formattedBranchFixture}.
 */
function pointBranchFixture(): LeafEditFixture {
	const view = asAlpha(
		createIndependentTreeAlpha({ forest: ForestTypeOptimized }).viewWith(
			new TreeViewConfiguration({ schema: PointArray }),
		),
	);
	view.initialize(
		Array.from({ length: 1000 }, (_, index) => new Point({ x: index, y: index })),
	);
	const branch = view.fork();
	branch.root[500].x = 1001;
	assert.equal(view.root[500].x, 500);
	return {
		forest: forestFromView(view),
		edit: () => view.merge(branch),
		verify: () => {
			assert.equal(view.root[500].x, 1001);
			assert.equal(view.root[500].y, 500);
		},
	};
}

const incomingEditFactory = configuredSharedTree({
	forest: ForestTypeOptimized,
	jsonValidator: FormatValidatorBasic,
}).getFactory();

/**
 * Queues a formatting edit on a paused receiver while sequencing and sender acknowledgement finish during setup.
 * The timed operation drains only the receiver's queue, including decoding and applying the change.
 * Network delay and sender work are excluded; the receiver has no concurrent local edits.
 */
function formattedRemoteFixture(): LeafEditFixture {
	const provider = new TestTreeProviderLite(2, incomingEditFactory);
	const config = new TreeViewConfiguration({ schema: FormattedDocument });
	const sender = provider.trees[0].viewWith(config);
	sender.initialize(FormattedDocument.fromString("x".repeat(formattedTextLength)));
	provider.synchronizeMessages();
	const receiver = provider.trees[1].viewWith(config);
	const runtime = provider.trees[1].containerRuntime;
	runtime.pauseInboundProcessing();
	sender.root.formatRange(0, formattedTextLength, { bold: true });
	// Synchronization acknowledges the sender but only queues messages at the paused receiver.
	provider.synchronizeMessages();
	assert.equal(formattedAtoms(receiver.root)[0].format.bold, false);
	return {
		forest: forestFromView(receiver),
		edit: () => runtime.resumeInboundProcessing(),
		verify: () => {
			assert.equal(receiver.root.getUniformRun(0), formattedTextLength);
			for (const atom of formattedAtoms(receiver.root)) {
				assert.equal(atom.format.bold, true);
			}
		},
	};
}

/**
 * Prepares a remote point edit with the same receiver-only timing boundary as {@link formattedRemoteFixture}.
 */
function pointRemoteFixture(): LeafEditFixture {
	const provider = new TestTreeProviderLite(2, incomingEditFactory);
	const config = new TreeViewConfiguration({ schema: PointArray });
	const sender = provider.trees[0].viewWith(config);
	sender.initialize(
		Array.from({ length: 1000 }, (_, index) => new Point({ x: index, y: index })),
	);
	provider.synchronizeMessages();
	const receiver = provider.trees[1].viewWith(config);
	const runtime = provider.trees[1].containerRuntime;
	runtime.pauseInboundProcessing();
	sender.root[500].x = 1001;
	// The unchanged value confirms that receiver-side application is still pending when setup returns.
	provider.synchronizeMessages();
	assert.equal(receiver.root[500].x, 500);
	return {
		forest: forestFromView(receiver),
		edit: () => runtime.resumeInboundProcessing(),
		verify: () => {
			assert.equal(receiver.root[500].x, 1001);
			assert.equal(receiver.root[500].y, 500);
		},
	};
}

/** Builds a chunked-forest array of `size` identical {@link Row} objects. */
function buildObjectArray(size: number): { root: ObjectArray; forest: IForestSubscription } {
	const view = createIndependentTreeAlpha({ forest: ForestTypeOptimized }).viewWith(
		new TreeViewConfiguration({ schema: ObjectArray }),
	);
	view.initialize(Array.from({ length: size }, () => new Row({ v: 1 })));
	return { root: view.root, forest: forestFromView(view) };
}

// #endregion

describe("chunked-forest coalescing benchmarks", () => {
	configureBenchmarkHooks();

	const performanceMode = currentBenchmarkMode === BenchmarkMode.Performance;
	const editSizes = performanceMode ? [100, 1000, 10000] : [100];
	const fragmentCounts = performanceMode ? [100, 1000] : [100];
	const arraySizes = performanceMode ? [100, 1000] : [100];
	const maxBenchmarkDurationSeconds = 5;

	describe("Sequence traversal depth", () => {
		for (const depth of [0, 4, 8, 64]) {
			let chunk: TreeChunk = new UniformChunk(
				shallowShape.withTopLevelLength(100),
				Array.from({ length: 100 }, (_, index) => index),
			);
			for (let layer = 0; layer < depth; layer++) {
				chunk = new SequenceChunk([chunk]);
			}
			benchmarkIt({
				title: `read current value, sequence depth ${depth}`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const cursor = chunk.cursor();
						cursor.enterNode(50);
						state.timeAllBatches(() => {
							assert.equal(cursor.value, 50);
						});
					},
					maxBenchmarkDurationSeconds,
				}),
			});
			benchmarkIt({
				title: `scan 100 nodes, sequence depth ${depth}`,
				...benchmarkDuration({
					benchmarkFn: () => {
						const reader = chunk.cursor();
						let sum = 0;
						for (let present = reader.firstNode(); present; present = reader.nextNode()) {
							sum += reader.value as number;
						}
						assert.equal(sum, 4950);
					},
					maxBenchmarkDurationSeconds,
				}),
			});
		}
	});

	describe("Basic chunk traversal", () => {
		const children = Array.from(
			{ length: 100 },
			(_, index) => new BasicChunk(shallowShape.type, new Map(), index),
		);
		const flat = new BasicChunk(brand("parent"), new Map([[EmptyKey, children]]));
		let deep = new BasicChunk(shallowShape.type, new Map(), 99);
		for (let depth = 0; depth < 100; depth++) {
			deep = new BasicChunk(brand("parent"), new Map([[EmptyKey, [deep]]]));
		}
		benchmarkIt({
			title: "scan 100 BasicChunk siblings",
			...benchmarkDuration({
				benchmarkFn: () => {
					const cursor = flat.cursor();
					cursor.enterNode(0);
					cursor.enterField(EmptyKey);
					let sum = 0;
					for (let present = cursor.firstNode(); present; present = cursor.nextNode()) {
						sum += cursor.value as number;
					}
					assert.equal(sum, 4950);
				},
				maxBenchmarkDurationSeconds,
			}),
		});
		benchmarkIt({
			title: "descend and ascend 100 BasicChunk nodes",
			...benchmarkDuration({
				benchmarkFn: () => {
					const cursor = deep.cursor();
					cursor.enterNode(0);
					for (let depth = 0; depth < 100; depth++) {
						cursor.enterField(EmptyKey);
						cursor.enterNode(0);
					}
					assert.equal(cursor.value, 99);
					for (let depth = 0; depth < 100; depth++) {
						cursor.exitNode();
						cursor.exitField();
					}
				},
				maxBenchmarkDurationSeconds,
			}),
		});
	});

	describe("Incoming leaf edits", () => {
		const cases = [
			{
				name: `bold ${formattedTextLength} characters: branch merge`,
				setup: formattedBranchFixture,
			},
			{
				name: "replace one coordinate in 1000 points: branch merge",
				setup: pointBranchFixture,
			},
			{
				name: `bold ${formattedTextLength} characters: remote receive`,
				setup: formattedRemoteFixture,
			},
			{
				name: "replace one coordinate in 1000 points: remote receive",
				setup: pointRemoteFixture,
			},
		];
		for (const { name, setup } of cases) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: name,
				...benchmarkDurationBatchless({
					benchmarkFn: (state) => {
						let running: boolean;
						do {
							const fixture = setup();
							running = state.time(() => fixture.edit());
							fixture.verify();
						} while (running);
					},
					maxBenchmarkDurationSeconds,
					minSampleCount: 30,
				}),
			});
		}
	});

	describe("Application leaf edits", () => {
		const cases = [
			{
				name: `bold ${formattedTextLength} characters`,
				setup: formattedRangeFixture,
				batchSize: 4,
			},
			{
				name: "replace one coordinate in 1000 points",
				setup: pointCoordinateFixture,
				batchSize: 32,
			},
		];
		for (const { name, setup, batchSize } of cases) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `${name}: edit time`,
				...benchmarkDurationBatchless({
					benchmarkFn: (state) => {
						let running: boolean;
						do {
							const fixture = setup();
							running = state.time(() => fixture.edit());
							fixture.verify();
						} while (running);
					},
					maxBenchmarkDurationSeconds,
					minSampleCount: 30,
				}),
			});
			// Each batch contains independent documents with one edit each, not repeated edits to a single document.
			// Results are retained bytes for the entire batch after GC; divide by batchSize for per-document figures.
			// Retaining fixtures keeps their views and histories alive. This is not peak memory or total allocations.
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `${name}: retained tree heap after ${batchSize} edits`,
				// Collecting a heap left by earlier suites can exceed Mocha's default timeout.
				correctnessTimeoutMs: 5000,
				...benchmarkMemoryUse({
					...memoryUseOfValue(() =>
						Array.from({ length: batchSize }, () => {
							const fixture = setup();
							fixture.edit();
							return fixture;
						}),
					),
					warmUpIterations: 4,
					keepIterations: 8,
				}),
			});
			// Retain only the root-field chunks so views, history, and detached repair content can be collected.
			// This separate storage-only measurement is not an additional amount to add to the full-view result.
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `${name}: attached-content heap after ${batchSize} edits`,
				correctnessTimeoutMs: 5000,
				...benchmarkMemoryUse({
					...memoryUseOfValue(() =>
						Array.from({ length: batchSize }, () => {
							const fixture = setup();
							fixture.edit();
							// Do not return the fixture: its callbacks would keep the view and history alive and defeat storage isolation.
							const roots = (fixture.forest as unknown as { roots: ChunkWithFields }).roots;
							return roots.fields?.get(rootFieldKey);
						}),
					),
					warmUpIterations: 4,
					keepIterations: 8,
				}),
			});
		}
	});

	// Compare two paths in the current implementation, not a historical implementation baseline.
	// Setup creates the forest, incoming content, and optional snapshot outside timing; teardown is also excluded.
	// Timing includes visitor acquisition, copy-on-write, optional forced BasicChunk conversion, and replacement.
	// The snapshot keeps the original roots shared through the edit to exercise copy-on-write.
	describe("Leaf replacement timing", () => {
		const field: FieldKey = brand("v");
		const incomingField: FieldKey = brand("incoming");
		const outgoingField: FieldKey = brand("outgoing");
		const shape = new TreeShape(brand(Row.identifier), false, [[field, shallowShape, 1]]);
		for (const shared of [false, true]) {
			for (const forceBasic of [false, true]) {
				benchmarkIt({
					type: BenchmarkType.Measurement,
					title: `${shared ? "shared" : "exclusive"}, ${forceBasic ? "force BasicChunk conversion" : "retain uniform storage"}, 1000 nodes`,
					...benchmarkDurationBatchless({
						benchmarkFn: (state) => {
							let running: boolean;
							do {
								const schema = new TreeStoredSchemaRepository(toInitialSchema(Row));
								const forest = buildChunkedForest(
									makeTreeChunker(
										schema,
										defaultSchemaPolicy,
										defaultIncrementalEncodingPolicy,
									),
								);
								// Seed one large chunk directly so every iteration starts identically, independent of initial chunk-size heuristics.
								forest.roots.fields.set(rootFieldKey, [
									new UniformChunk(
										shape.withTopLevelLength(1000),
										Array.from({ length: 1000 }, () => 1),
									),
								]);
								forest.roots.fields.set(incomingField, [
									new UniformChunk(shallowShape.withTopLevelLength(1), [2]),
								]);
								// Cloning roots shares both the destination and incoming storage, exercising safe handling of both sides of replacement.
								const snapshot = shared ? forest.clone(schema) : undefined;
								running = state.time(() => {
									const visitor = forest.acquireVisitor();
									if (forceBasic) {
										// Conversion stays inside the timer because it is the additional work this comparison measures.
										const roots = forest.roots.fields.get(rootFieldKey);
										if (roots === undefined) {
											throw new Error("Missing benchmark roots");
										}
										ensureExclusiveBasicChunk(roots, 500, {
											policy: forest.chunker,
											idCompressor: undefined,
										});
									}
									visitor.enterField(rootFieldKey);
									visitor.enterNode(500);
									visitor.enterField(field);
									visitor.replace(incomingField, { start: 0, end: 1 }, outgoingField, {
										minor: 0,
									});
									visitor.exitField(field);
									visitor.exitNode(500);
									visitor.exitField(rootFieldKey);
									visitor.free();
								});
								snapshot?.roots.referenceRemoved();
								snapshot?.chunker.dispose();
								forest.roots.referenceRemoved();
								forest.chunker.dispose();
							} while (running);
						},
						maxBenchmarkDurationSeconds,
					}),
				});
			}
		}
	});

	// After typing N characters through the real editor, coalescing keeps the field batched into few
	// multi-node UniformChunks (~N/10) instead of one single-node chunk per character (~N).
	describe("Uniform chunk count after typing", () => {
		for (const size of editSizes) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `uniform chunk count after typing ${size} characters`,
				run: async () => {
					const forest = typeIntoChunkedDocument(size);
					return [
						{
							name: "uniformChunkCount",
							value: countUniformChunks(forest),
							units: "chunks",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
					] satisfies CollectedData;
				},
			});
		}
	});

	// The no-coalescing case is a within-run control for the shallow homogeneous insertion model.
	// Deep cases also copy larger value arrays; the heterogeneous case rejects mismatched root types without a field walk.
	describe("Per-edit coalescing time", () => {
		const timeCase = (title: string, edit: () => void): void => {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title,
				...benchmarkDurationBatchless({
					benchmarkFn: (state) => {
						let running: boolean;
						do {
							running = state.time(edit);
						} while (running);
					},
					maxBenchmarkDurationSeconds,
				}),
			});
		};
		timeCase("insert edit, no coalesce (baseline)", () =>
			insertEdit(shallowShape, shallowValues, shallowShape, shallowValues, false),
		);
		timeCase("insert edit + coalesce, shallow homogeneous", () =>
			insertEdit(shallowShape, shallowValues, shallowShape, shallowValues, true),
		);
		timeCase("insert edit + coalesce, deep homogeneous", () =>
			insertEdit(deepShapeA, deepValues, deepShapeA, deepValues, true),
		);
		timeCase("insert edit + coalesce, deep heterogeneous (type mismatch)", () =>
			insertEdit(deepShapeA, deepValues, deepShapeB, deepValues, true),
		);
	});

	// Compare a field fragmented into single-node UniformChunks against the same field after coalescing.
	// Coalescing removes per-chunk overhead (not stored values), so a light (plain) shape reclaims a
	// large fraction while a heavy (formatted) shape reclaims less.
	describe("Memory reclaimed by coalescing", () => {
		const shapes = [
			{ name: "light (plain)", shape: shallowShape, values: shallowValues },
			{ name: "heavy (formatted)", shape: deepShapeA, values: deepValues },
		] as const;
		for (const { name, shape, values } of shapes) {
			describe(name, () => {
				for (const count of fragmentCounts) {
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `fragmented ${count} single-node chunks`,
						...benchmarkMemoryUse({
							...memoryUseOfValue(() => buildFragmentedField(count, shape, values)),
							...iterationSettings,
						}),
					});
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `coalesced from ${count} single-node chunks`,
						...benchmarkMemoryUse({
							...memoryUseOfValue(() => {
								const field = buildFragmentedField(count, shape, values);
								coalesceUniformChunks(field, policy, { start: 0, end: field.length });
								return field;
							}),
							...iterationSettings,
						}),
					});
				}
			});
		}
	});

	// Compatible leaf replacement should preserve uniform runs rather than converting their parent nodes to BasicChunks.
	// Compare non-uniform counts and the largest uniform run before and after the edit.
	// Total chunk count can increase because the forest also retains outgoing content for repair, not because the document fragmented.
	describe("Chunk storage after leaf replacement", () => {
		const report = (forest: IForestSubscription): CollectedData => {
			const { total, basic, largestUniformNodes } = chunkStats(forest);
			return [
				{
					name: "basicChunks",
					value: basic,
					units: "chunks",
					type: ValueType.SmallerIsBetter,
					significance: "Primary",
				},
				{
					name: "largestUniformChunkNodes",
					value: largestUniformNodes,
					units: "nodes",
					type: ValueType.LargerIsBetter,
					significance: "Secondary",
				},
				{
					name: "totalChunks",
					value: total,
					units: "chunks",
					type: ValueType.SmallerIsBetter,
					significance: "Secondary",
				},
			];
		};
		for (const size of arraySizes) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `fresh array of ${size} objects (before edit)`,
				run: async () => report(buildObjectArray(size).forest),
			});
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `after one middle in-place edit (${size} objects)`,
				run: async () => {
					const { root, forest } = buildObjectArray(size);
					root[Math.floor(size / 2)].v = 99;
					return report(forest);
				},
			});
		}
	});
});
