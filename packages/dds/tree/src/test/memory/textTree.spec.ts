/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type IMemoryTestObject,
	benchmarkMemory,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { TreeCompressionStrategy } from "../../feature-libraries/index.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	type SharedTreeOptions,
} from "../../shared-tree/index.js";
import {
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type TreeView,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { TextAsTree } from "../../text/textDomain.js";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree } from "../../text/textDomainFormatted.js";
import { configuredSharedTree } from "../../treeFactory.js";
import { testIdCompressor } from "../utils.js";

function generateText(length: number): string {
	const chars = "abcdefghijklmnopqrstuvwxyz";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += chars[i % chars.length];
	}
	return result;
}

interface TextVariant {
	readonly name: string;
	readonly schema: ImplicitFieldSchema;
	readonly charCounts: readonly number[];
	createContent(text: string): unknown;
}

const plainText: TextVariant = {
	name: "plain",
	schema: TextAsTree.Tree,
	charCounts: isInPerformanceTestingMode ? [10, 100, 1000] : [10],
	createContent: (text: string) => TextAsTree.Tree.fromString(text),
};

const formattedText: TextVariant = {
	name: "formatted",
	schema: FormattedTextAsTree.Tree,
	// Formatted text has ~6x more nodes per character, so use smaller sizes.
	charCounts: isInPerformanceTestingMode ? [5, 50, 100] : [5],
	createContent: (text: string) => FormattedTextAsTree.Tree.fromString(text),
};

const textVariants = [plainText, formattedText];

const forestTypes = [
	["ObjectForest", ForestTypeReference],
	["ChunkedForest", ForestTypeOptimized],
] as const;

function createTextTree(
	variant: TextVariant,
	charCount: number,
	options: SharedTreeOptions = {},
): TreeView<ImplicitFieldSchema> {
	const sharedTree = configuredSharedTree(options);
	const tree = sharedTree.create(
		new MockFluidDataStoreRuntime({
			registry: [sharedTree.getFactory()],
			idCompressor: testIdCompressor,
		}),
		"testTextTree",
	);
	const view = tree.viewWith(new TreeViewConfiguration({ schema: variant.schema }));
	view.initialize(variant.createContent(generateText(charCount)) as never);
	return view;
}

describe("Text tree memory usage", () => {
	// IMPORTANT: variables scoped to the test suite are a big problem for memory-profiling tests
	// because they won't be out of scope when we garbage-collect between runs of the same test,
	// and that will skew measurements. Tests should allocate all the memory they need using local
	// variables scoped to the test function itself, so several iterations of a given test can
	// measure from the same baseline (as much as possible).
	//
	// NOTE: The initialization benchmarks produce reliable results because creating an entire tree
	// is a large allocation that clearly exceeds GC variance. The insert and remove benchmarks
	// are included for completeness but produce noisy results — individual text edits allocate
	// (or free) too little memory relative to GC variance between heap snapshots.
	// For reliable edit performance comparisons between forest types, see the time-based
	// benchmarks in textForest.bench.ts.

	for (const variant of textVariants) {
		describe(`${variant.name} text`, () => {
			for (const charCount of variant.charCounts) {
				for (const [forestName, forestType] of forestTypes) {
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							public readonly title =
								`initialize ${variant.name} text tree with ${charCount} characters using ${forestName}`;

							// Assign to this field so that JS GC does not collect the tree instance.
							private _view: TreeView<ImplicitFieldSchema> | undefined;

							public async run(): Promise<void> {
								this._view = createTextTree(variant, charCount, {
									forest: forestType,
									treeEncodeType: TreeCompressionStrategy.Compressed,
								});
							}

							public beforeIteration(): void {
								this._view = undefined;
							}
						})(),
					).timeout(400000);
				}
			}

			for (const charCount of variant.charCounts) {
				for (const [forestName, forestType] of forestTypes) {
					// Insert half the document size so the allocation dominates GC noise.
					const insertCount = Math.max(1, Math.floor(charCount / 2));
					const insertText = generateText(insertCount);
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							public readonly title =
								`insert ${insertCount} characters into ${variant.name} text tree with ${charCount} characters using ${forestName}`;

							private view: TreeView<ImplicitFieldSchema> | undefined;

							public async run(): Promise<void> {
								assert(this.view !== undefined);
								(this.view.root as unknown as TextAsTree.Members).insertAt(
									Math.floor(charCount / 2),
									insertText,
								);
							}

							public beforeIteration(): void {
								this.view = createTextTree(variant, charCount, {
									forest: forestType,
									treeEncodeType: TreeCompressionStrategy.Compressed,
								});
							}
						})(),
					).timeout(400000);
				}
			}

			for (const charCount of variant.charCounts) {
				for (const [forestName, forestType] of forestTypes) {
					// Remove half the document so the deallocation dominates GC noise.
					const removeCount = Math.max(1, Math.floor(charCount / 2));
					const removeStart = Math.floor((charCount - removeCount) / 2);
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							public readonly title =
								`remove ${removeCount} characters from ${variant.name} text tree with ${charCount} characters using ${forestName}`;

							private view: TreeView<ImplicitFieldSchema> | undefined;

							public async run(): Promise<void> {
								assert(this.view !== undefined);
								(this.view.root as unknown as TextAsTree.Members).removeRange(
									removeStart,
									removeStart + removeCount,
								);
							}

							public beforeIteration(): void {
								this.view = createTextTree(variant, charCount, {
									forest: forestType,
									treeEncodeType: TreeCompressionStrategy.Compressed,
								});
							}
						})(),
					).timeout(400000);
				}
			}
		});
	}
});
