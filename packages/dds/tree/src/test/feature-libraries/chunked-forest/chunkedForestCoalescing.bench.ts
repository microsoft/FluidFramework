/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BenchmarkMode,
	BenchmarkType,
	benchmarkDurationBatchless,
	benchmarkIt,
	benchmarkMemoryUse,
	currentBenchmarkMode,
	memoryUseOfValue,
	ValueType,
	type CollectedData,
} from "@fluid-tools/benchmark";

import type {
	FieldKey,
	IForestSubscription,
	TreeChunk,
	TreeNodeSchemaIdentifier,
	TreeValue,
} from "../../../core/index.js";
import {
	coalesceUniformChunks,
	type ChunkPolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import {
	ForestTypeOptimized,
	createIndependentTreeAlpha,
} from "../../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	booleanSchema,
	numberSchema,
	stringSchema,
} from "../../../simple-tree/index.js";
import { TextAsTree } from "../../../text/index.js";
import { brand } from "../../../util/index.js";
import { configureBenchmarkHooks } from "../../utils.js";

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
 * A formatted-atom-like shape: a `content` string leaf plus a `CharacterFormat` object with five leaf
 * fields (bold, italic, underline, size, font), built from the real leaf primitives. `TreeShape.equals`
 * must recurse the whole nested structure, so this is the "deep shape" whose comparison dominates
 * coalescing's per-edit cost.
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
// `deepShapeA` and `deepShapeB` share an identical nested field structure but differ in top-level type,
// so `equals` performs the full recursive field walk and only fails at the final type check — the most
// expensive way for a comparison to return `false`.
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
 * `splitFieldAtIndex` performs internally when an edit lands inside a multi-node chunk. (The real
 * `splitFieldAtIndex` re-chunks through the schema-driven chunker, so it only accepts schema-derived
 * shapes; splitting by hand here lets the benchmark exercise the edit on synthetic shapes.)
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
 * Performs one insert edit into the middle of a `editChunkNodeCount`-node UniformChunk of `fieldShape`:
 * split the chunk, splice in a single new node of `insertShape`, then optionally coalesce the seam
 * (exactly the split → splice → coalesce sequence the forest's `attachEdit` runs). When `insertShape`
 * matches `fieldShape` the seam coalesces back together; when it differs, coalescing does its full
 * (failing) structural comparison and merges nothing.
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
 * @returns the total chunk count, the number of non-uniform (e.g. basic) chunks — which rises by one
 * per shattered node — and the size (in nodes) of the largest UniformChunk, which shows how compactly
 * same-shape runs are batched.
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

// #region Text-editor helpers (real insert path over the chunked forest).

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
		new TreeViewConfiguration({ schema: TextAsTree.Tree }),
	);
	view.initialize(TextAsTree.Tree.fromString(""));
	const root = view.root;
	for (let i = 0; i < size; i++) {
		root.insertAt(Math.floor(root.characterCount() / 2), i % 2 === 0 ? "a" : "b");
	}
	return forestFromView(view);
}

// A large array of same-shape objects batches into a few multi-node UniformChunks. Editing one field of
// a node in the middle of such a chunk shatters the whole chunk into per-node BasicChunks (chunkedForest
// `enterNode`), which coalescing does not undo — used to show the boundary of the coalescing win.
const objectSchemaFactory = new SchemaFactory("bench.chunkedForestCoalescing");
class Row extends objectSchemaFactory.object("Row", { v: objectSchemaFactory.number }) {}
class ObjectArray extends objectSchemaFactory.array("ObjectArray", Row) {}

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

	// Per-edit overhead of coalescing. Each case performs a real insert edit — split a multi-node
	// UniformChunk, splice in a new node, then (optionally) coalesce the seam — mirroring the forest's
	// `attachEdit`. The "no coalesce" baseline does the split+splice edit without coalescing; the deltas
	// above it are the coalescing overhead. "deep heterogeneous" is the worst case: the inserted node has
	// a different (deep) shape, so the structural `equals` does maximal work and the seam never merges.
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
		timeCase("insert edit + coalesce, deep heterogeneous (worst case)", () =>
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

	// A large array of same-shape objects batches into a few multi-node UniformChunks. A single in-place
	// edit to one field of a node shatters *only the one UniformChunk enclosing that node* into per-node
	// BasicChunks (chunkedForest `enterNode`); the other chunks are untouched. Coalescing operates on
	// attach/detach seams and only merges UniformChunks, so it neither causes nor undoes this pre-existing
	// shatter. Metrics: `basicChunks` rises by the enclosing chunk's node count (the shatter's blast
	// radius); `largestUniformChunkNodes` shows the compact run either destroyed (single-chunk array) or
	// surviving (multi-chunk array — the edit is localized).
	describe("In-place edit chunk shatter (not addressed by coalescing)", () => {
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
