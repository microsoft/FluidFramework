/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { BenchmarkType, benchmarkCustom } from "@fluid-tools/benchmark";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { createIndependentTreeAlpha, Tree, TreeAlpha } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import { TextAsTree } from "../../text/index.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { configureBenchmarkHooks } from "../utils.js";

import {
	createConnectedTree,
	getOperationsStats,
	registerOpListener,
	utf8Length,
} from "./opBenchmarkUtilities.js";

describe("TextDomain benchmarks", () => {
	describe("TextDomain op size benchmarks", () => {
		configureBenchmarkHooks();

		const schemaFactory = new SchemaFactory("bench.textDepth");

		// String literal types for 10- and 100-character "a" key names.
		type A10 = "aaaaaaaaaa";
		type A100 = `${A10}${A10}${A10}${A10}${A10}${A10}${A10}${A10}${A10}${A10}`;

		const key1 = "a" as const;
		const key10 = "a".repeat(10) as A10;
		const key100 = "a".repeat(100) as A100;

		// #region Schema definitions
		// Each wrapper schema places a TextAsTree.Tree node under a property key of a fixed length.
		// The key length affects op size because property names appear in encoded tree paths.

		class WrapperKeyLen1 extends schemaFactory.objectRecursive(
			"bench.textDepth.WrapperKeyLen1",
			{
				[key1]: [() => WrapperKeyLen1, TextAsTree.Tree],
			},
		) {}
		{
			type _check = ValidateRecursiveSchema<typeof WrapperKeyLen1>;
		}

		class WrapperKeyLen10 extends schemaFactory.objectRecursive(
			"bench.textDepth.WrapperKeyLen10",
			{
				[key10]: [() => WrapperKeyLen10, TextAsTree.Tree],
			},
		) {}
		{
			type _check = ValidateRecursiveSchema<typeof WrapperKeyLen10>;
		}

		class WrapperKeyLen100 extends schemaFactory.objectRecursive(
			"bench.textDepth.WrapperKeyLen100",
			{
				[key100]: [() => WrapperKeyLen100, TextAsTree.Tree],
			},
		) {}
		{
			type _check = ValidateRecursiveSchema<typeof WrapperKeyLen100>;
		}

		// #endregion

		/**
		 * Depths at which to place the text node within the wrapper tree.
		 * A deeper text node results in a longer path in the generated op, which increases op size.
		 */
		const nodeDepths = [1, 10, 100] as const;

		/**
		 * Numbers of characters to insert or remove in each benchmark.
		 */
		const charCounts = [1, 10, 100] as const;

		/**
		 * One entry per wrapper schema variant. Each bundle captures the view config, a factory for
		 * building wrapper trees of a given depth, and a helper for finding the leaf text node.
		 *
		 * `getLeaf` accepts `unknown` so that the heterogeneous array can be iterated uniformly;
		 * each implementation casts `root` to its specific wrapper type before traversal.
		 */
		const testSchemaConfigurations = [
			{
				keyLength: 1,
				viewConfig: new TreeViewConfiguration({ schema: WrapperKeyLen1 }),
				makeTree(depth: number, text: string): WrapperKeyLen1 {
					const textNode = TextAsTree.Tree.fromString(text);
					let current: WrapperKeyLen1 = new WrapperKeyLen1({ a: textNode });
					for (let i = 1; i < depth; i++) {
						current = new WrapperKeyLen1({ a: current });
					}
					return current;
				},
				getLeaf(root: unknown): TextAsTree.Tree {
					assert(Tree.is(root, WrapperKeyLen1));
					let current: WrapperKeyLen1 | TextAsTree.Tree = root;
					while (!Tree.is(current, TextAsTree.Tree)) {
						current = current.a;
					}
					return current;
				},
				benchmarkType: BenchmarkType.Measurement,
			},
			{
				keyLength: 10,
				viewConfig: new TreeViewConfiguration({ schema: WrapperKeyLen10 }),
				makeTree(depth: number, text: string): WrapperKeyLen10 {
					const textNode = TextAsTree.Tree.fromString(text);
					let current: WrapperKeyLen10 = new WrapperKeyLen10({ [key10]: textNode });
					for (let i = 1; i < depth; i++) {
						current = new WrapperKeyLen10({ [key10]: current });
					}
					return current;
				},
				getLeaf(root: unknown): TextAsTree.Tree {
					assert(Tree.is(root, WrapperKeyLen10));
					let current: WrapperKeyLen10 | TextAsTree.Tree = root;
					while (!Tree.is(current, TextAsTree.Tree)) {
						current = current[key10];
					}
					return current;
				},
				benchmarkType: BenchmarkType.Perspective,
			},
			{
				keyLength: 100,
				viewConfig: new TreeViewConfiguration({ schema: WrapperKeyLen100 }),
				makeTree(depth: number, text: string): WrapperKeyLen100 {
					const textNode = TextAsTree.Tree.fromString(text);
					let current: WrapperKeyLen100 = new WrapperKeyLen100({ [key100]: textNode });
					for (let i = 1; i < depth; i++) {
						current = new WrapperKeyLen100({ [key100]: current });
					}
					return current;
				},
				getLeaf(root: unknown): TextAsTree.Tree {
					assert(Tree.is(root, WrapperKeyLen100));
					let current: WrapperKeyLen100 | TextAsTree.Tree = root;
					while (!Tree.is(current, TextAsTree.Tree)) {
						current = current[key100];
					}
					return current;
				},
				benchmarkType: BenchmarkType.Measurement,
			},
		];

		describe("Plain text", () => {
			const currentTestOps: ISequencedDocumentMessage[] = [];

			beforeEach(() => {
				currentTestOps.length = 0;
			});

			afterEach(function () {
				if (this.currentTest?.isFailed() === false) {
					assert(currentTestOps.length > 0);
				}
				currentTestOps.length = 0;
			});

			describe("Insert characters", () => {
				for (const depth of nodeDepths) {
					for (const testSchemaConfiguration of testSchemaConfigurations) {
						for (const charCount of charCounts) {
							benchmarkCustom({
								only: false,
								type: testSchemaConfiguration.benchmarkType,
								title: `insert ${charCount} character(s) into empty string at depth ${depth} with key length ${testSchemaConfiguration.keyLength}`,
								run: async (reporter) => {
									const tree = createConnectedTree();
									registerOpListener(tree, currentTestOps);
									// view.initialize and view.root types are schema-specific; cast to a
									// common interface since the bundle array is heterogeneous.
									const view = tree.viewWith(
										testSchemaConfiguration.viewConfig as unknown as TreeViewConfiguration<
											typeof WrapperKeyLen1
										>,
									) as unknown as { initialize(data: unknown): void; root: unknown };
									view.initialize(testSchemaConfiguration.makeTree(depth, ""));
									currentTestOps.length = 0; // discard initialization ops

									const textNode = testSchemaConfiguration.getLeaf(view.root);
									textNode.insertAt(0, "a".repeat(charCount));

									assert.equal(textNode.characterCount(), charCount);
									const opStats = getOperationsStats(currentTestOps);
									for (const key of Object.keys(opStats)) {
										reporter.addMeasurement(key, opStats[key]);
									}
								},
							});
						}
					}
				}
			});

			describe("Remove characters", () => {
				for (const depth of nodeDepths) {
					for (const testSchemaConfiguration of testSchemaConfigurations) {
						for (const charCount of charCounts) {
							benchmarkCustom({
								only: false,
								type: testSchemaConfiguration.benchmarkType,
								title: `remove ${charCount} character(s) from string of 1000 characters at depth ${depth} with key length ${testSchemaConfiguration.keyLength}`,
								run: async (reporter) => {
									const tree = createConnectedTree();
									registerOpListener(tree, currentTestOps);
									// view.initialize and view.root types are schema-specific; cast to a
									// common interface since the bundle array is heterogeneous.
									const view = tree.viewWith(
										testSchemaConfiguration.viewConfig as unknown as TreeViewConfiguration<
											typeof WrapperKeyLen1
										>,
									) as unknown as { initialize(data: unknown): void; root: unknown };
									view.initialize(testSchemaConfiguration.makeTree(depth, "a".repeat(1000)));
									currentTestOps.length = 0; // discard initialization ops

									const textNode = testSchemaConfiguration.getLeaf(view.root);
									textNode.removeRange(0, charCount);

									assert.equal(textNode.characterCount(), 1000 - charCount);
									const opStats = getOperationsStats(currentTestOps);
									for (const key of Object.keys(opStats)) {
										reporter.addMeasurement(key, opStats[key]);
									}
								},
							});
						}
					}
				}
			});
		});

		// TODO: formatted text benchmarks.
	});

	describe("TextDomain encoding benchmarks", () => {
		const testConfigs = [
			{ stringLength: 1, benchmarkType: BenchmarkType.Measurement },
			{ stringLength: 10, benchmarkType: BenchmarkType.Perspective },
			{ stringLength: 100, benchmarkType: BenchmarkType.Perspective },
			{ stringLength: 1000, benchmarkType: BenchmarkType.Measurement }
		] as const;

		configureBenchmarkHooks();

		const viewConfig = new TreeViewConfiguration({ schema: TextAsTree.Tree });

		describe("TextAsTree.Tree node encoded size", () => {
			for (const testConfig of testConfigs) {
				benchmarkCustom({
					only: false,
					type: testConfig.benchmarkType,
					title: `exportVerbose encoded size for string of length ${testConfig.stringLength}`,
					run: async (reporter) => {
						const independentTree = createIndependentTreeAlpha({});
						const view = independentTree.viewWith(viewConfig);
						view.initialize(TextAsTree.Tree.fromString("a".repeat(testConfig.stringLength)));

						const encoded = TreeAlpha.exportVerbose(view.root);
						// TextAsTree nodes never contain IFluidHandle, so this cast is safe.
						const encodedSize = utf8Length(encoded as unknown as JsonCompatibleReadOnly);

						reporter.addMeasurement("Encoded Size (Bytes)", encodedSize);
					},
				});
			}
		});

		// TODO: formatted text benchmarks.
	});
});
