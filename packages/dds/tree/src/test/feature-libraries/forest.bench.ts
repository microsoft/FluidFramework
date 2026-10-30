/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkMode,
	benchmarkDuration,
	benchmarkDurationBatchless,
	benchmarkIt,
	benchmarkMemoryUse,
	currentBenchmarkMode,
	memoryUseOfValue,
} from "@fluid-tools/benchmark";

import {
	EmptyKey,
	type FieldKey,
	type IEditableForest,
	type MapTree,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	rootFieldKey,
} from "../../core/index.js";
import {
	buildChunkedForest,
	buildForest,
	cursorForMapTreeNode,
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
	makeTreeChunker,
	mapTreeFromCursor,
} from "../../feature-libraries/index.js";
import { JsonAsTree } from "../../jsonDomainSchema.js";
import { SchemaFactory, toInitialSchema } from "../../simple-tree/index.js";
import { brand, Breakable, type JsonCompatible } from "../../util/index.js";
import { singleJsonCursor } from "../json/index.js";
import { configureBenchmarkHooks, fieldCursorFromInsertable } from "../utils.js";

const factory = new SchemaFactory("forest-benchmarks");
class Row extends factory.object("Row", {
	a: factory.number,
	b: factory.number,
	c: factory.number,
	d: factory.number,
}) {}
class Rows extends factory.array("Rows", Row) {}

/**
 * All workloads have an array root, so the same edit can grow its child field after construction.
 * Input trees and schema definitions are prepared outside measurements.
 * Forest construction allocates its own nodes and field arrays.
 */
interface Workload {
	readonly tree: MapTree;
	readonly insertedTree: MapTree;
	readonly schema: TreeStoredSchema;
	readonly length: number;
}

function jsonWorkload(content: JsonCompatible[]): Workload {
	return {
		tree: mapTreeFromCursor(singleJsonCursor(content)),
		insertedTree: mapTreeFromCursor(singleJsonCursor(1)),
		schema: toInitialSchema(JsonAsTree.Tree),
		length: content.length,
	};
}

/**
 * Build through the forest visitor without a SharedTree, view, anchors, or edit history.
 * Unlike initializeForest, this does not first chunk the input for the reference forest.
 */
function populate(forest: IEditableForest, tree: MapTree): IEditableForest {
	const visitor = forest.acquireVisitor();
	const source: FieldKey = brand("forest-benchmark-source");
	visitor.create([cursorForMapTreeNode(tree)], source);
	visitor.enterField(rootFieldKey);
	visitor.attach(source, 1, 0);
	visitor.exitField(rootFieldKey);
	visitor.free();
	return forest;
}

/**
 * Insert a node in the middle of a completed field, then remove and destroy it.
 * Repeating this on fresh forests measures the first growth without amortizing away reallocation.
 */
function growAndShrinkInMiddle(forest: IEditableForest, tree: MapTree, length: number): void {
	const visitor = forest.acquireVisitor();
	const source: FieldKey = brand("forest-benchmark-source");
	const removed: FieldKey = brand("forest-benchmark-removed");
	visitor.create([cursorForMapTreeNode(tree)], source);
	visitor.enterField(rootFieldKey);
	visitor.enterNode(0);
	visitor.enterField(EmptyKey);
	const middle = Math.floor(length / 2);
	visitor.attach(source, 1, middle);
	visitor.detach({ start: middle, end: middle + 1 }, removed, { minor: 0 }, false);
	visitor.exitField(EmptyKey);
	visitor.exitNode(0);
	visitor.exitField(rootFieldKey);
	visitor.destroy(removed, 1);
	visitor.free();
}

/**
 * Measures the memory and execution-time tradeoffs of compacting forest child arrays after construction.
 * On V8, copying with .slice() removes spare backing-array capacity, reducing retained memory
 * at the cost of an additional copy and potentially an earlier reallocation when the field grows.
 * These forest-only benchmarks isolate construction, cloning, and the first insertion/removal
 * on a freshly constructed field, without higher-level SharedTree or view costs.
 *
 * Changes to the compaction policy should also be evaluated with broader benchmarks, rather than
 * using these isolated measurements alone to assess the application-level memory and runtime tradeoff:
 * - `shared-tree/textDomain.integration.bench.ts`: whole-document plain/formatted text memory, construction, summary loading, reads, and edits with both forests.
 * - `tableSchema.bench.ts`: table edits, undo/redo, and incremental retained memory.
 * - `domains/json/jsonCursor.bench.ts`: traversal of Canada, Twitter, and CITM data with both forests.
 * - `shared-tree/summary.bench.ts`: summary loading.
 * - `memory/tree.spec.ts`: SharedTree retained memory for different tree shapes.
 * Paths are relative to `src/test`.
 */
describe("Forest field array exact-sizing benchmarks", () => {
	configureBenchmarkHooks();
	const performanceMode = currentBenchmarkMode === BenchmarkMode.Performance;
	const rowCount = performanceMode ? 2000 : 10;
	const timing = { maxBenchmarkDurationSeconds: 3 };
	// Limit expensive garbage-collection iterations to keep the memory benchmark sweep tractable.
	const iterationSettings = { keepIterations: 4, warmUpIterations: 2 };
	const workloads: readonly { name: string; createWorkload: () => Workload }[] = [
		{
			name: "singleton fields",
			createWorkload: () =>
				jsonWorkload(Array.from({ length: rowCount }, () => ({ a: 1, b: 2, c: 3, d: 4 }))),
		},
		{
			name: "wide polymorphic field",
			createWorkload: () =>
				jsonWorkload(
					Array.from({ length: performanceMode ? 20000 : 20 }, (_, index) =>
						index % 2 === 0 ? index : "x",
					),
				),
		},
		{
			// The fixed row schema lets ChunkedForest use UniformChunks instead of per-property
			// child arrays, so exact-sizing those arrays should provide little memory benefit.
			// This is a control for the optimized storage path; ObjectForest still uses child arrays.
			name: "uniform rows",
			createWorkload: () => {
				const cursor = fieldCursorFromInsertable(
					Rows,
					Array.from({ length: rowCount }, () => ({ a: 1, b: 2, c: 3, d: 4 })),
				);
				cursor.enterNode(0);
				const tree = mapTreeFromCursor(cursor);
				return {
					tree,
					insertedTree: tree.fields.get(EmptyKey)?.[0] ?? assert.fail("Missing array entry"),
					schema: toInitialSchema(Rows),
					length: rowCount,
				};
			},
		},
	];

	const forests = [
		{
			name: "ObjectForest",
			create: (schema: TreeStoredSchemaRepository) =>
				buildForest(new Breakable("forest benchmark"), schema),
		},
		{
			name: "ChunkedForest",
			create: (schema: TreeStoredSchemaRepository) =>
				buildChunkedForest(
					makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
				),
		},
	] as const;

	for (const { name, createWorkload } of workloads) {
		describe(name, () => {
			for (const forestType of forests) {
				describe(forestType.name, () => {
					function createFixture() {
						const workload = createWorkload();
						const edit = (forest: IEditableForest) =>
							growAndShrinkInMiddle(forest, workload.insertedTree, workload.length);
						const makeForest = () => {
							const schema = new TreeStoredSchemaRepository(workload.schema);
							const forest = forestType.create(schema);
							return populate(forest, workload.tree);
						};
						return { workload, makeForest, edit };
					}

					benchmarkIt({
						title: "construct",
						...benchmarkDuration({
							benchmarkFnCustom: async (state) => {
								const { makeForest } = createFixture();
								state.timeAllBatches(() => makeForest());
							},
							...timing,
						}),
					});
					benchmarkIt({
						title: "retained memory",
						...benchmarkMemoryUse({
							benchmarkFn: async (state) => {
								const { makeForest } = createFixture();
								await memoryUseOfValue(() => makeForest()).benchmarkFn(state);
							},
							enableAsyncGC: false,
							...iterationSettings,
						}),
					});
					benchmarkIt({
						title: "clone retained memory",
						...benchmarkMemoryUse({
							benchmarkFn: async (state) => {
								const { workload, makeForest } = createFixture();
								await memoryUseOfValue(() =>
									makeForest().clone(new TreeStoredSchemaRepository(workload.schema)),
								).benchmarkFn(state);
							},
							enableAsyncGC: false,
							...iterationSettings,
						}),
					});
					benchmarkIt({
						title: "clone",
						...benchmarkDuration({
							benchmarkFnCustom: async (state) => {
								const { workload, makeForest } = createFixture();
								const forest = makeForest();
								state.timeAllBatches(() => {
									forest.clone(new TreeStoredSchemaRepository(workload.schema));
								});
							},
							...timing,
						}),
					});
					benchmarkIt({
						title: "first growth after construction",
						...benchmarkDurationBatchless({
							benchmarkFn: (state) => {
								const { makeForest, edit } = createFixture();
								let running: boolean;
								do {
									const forest = makeForest();
									running = state.time(() => edit(forest));
								} while (running);
							},
							...timing,
						}),
					});
				});
			}
		});
	}
});
