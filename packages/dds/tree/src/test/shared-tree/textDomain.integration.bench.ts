/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { BenchmarkType, benchmarkCustom } from "@fluid-tools/benchmark";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { Tree } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import { TextAsTree } from "../../text/index.js";
import { configureBenchmarkHooks } from "../utils.js";

import {
	createConnectedTree,
	getOperationsStats,
	registerOpListener,
} from "./opBenchmarkUtilities.js";

const schemaFactory = new SchemaFactory("bench.textDepth");

/**
 * A recursive wrapper node used to place a text node at an arbitrary depth within a tree.
 * The `child` field either contains another wrapper (for deeper nesting) or the leaf text node.
 */
class DeepTextWrapper extends schemaFactory.objectRecursive("DeepTextWrapper", {
	child: [() => DeepTextWrapper, TextAsTree.Tree],
}) {}
{
	type _check = ValidateRecursiveSchema<typeof DeepTextWrapper>;
}

/**
 * Builds a {@link DeepTextWrapper} tree with the text node at the given depth.
 * At depth 1, the root wrapper directly contains the text node as its child.
 */
function makeDeepTextTree(depth: number, textContent: string): DeepTextWrapper {
	const textNode = TextAsTree.Tree.fromString(textContent);
	let current: DeepTextWrapper = new DeepTextWrapper({ child: textNode });
	for (let i = 1; i < depth; i++) {
		current = new DeepTextWrapper({ child: current });
	}
	return current;
}

/**
 * Traverses a {@link DeepTextWrapper} tree to find the leaf {@link TextAsTree.Tree} node.
 */
function getLeafTextNode(root: DeepTextWrapper): TextAsTree.Tree {
	let current: DeepTextWrapper | TextAsTree.Tree = root;
	while (!Tree.is(current, TextAsTree.Tree)) {
		current = current.child;
	}
	return current;
}

/**
 * Depths at which to place the text node within the wrapper tree.
 * A deeper text node results in a longer path in the generated op, which increases op size.
 */
const nodeDepths = [
	[1, BenchmarkType.Measurement],
	[10, BenchmarkType.Perspective],
	[100, BenchmarkType.Measurement],
] as const;

describe.only("TextDomain integration benchmarks", () => {
	configureBenchmarkHooks();

	describe("Plain text", () => {
		const currentTestOps: ISequencedDocumentMessage[] = [];
		const viewConfig = new TreeViewConfiguration({ schema: DeepTextWrapper });

		beforeEach(() => {
			currentTestOps.length = 0;
		});

		afterEach(function () {
			if (this.currentTest?.isFailed() === false) {
				assert(currentTestOps.length > 0);
			}
			currentTestOps.length = 0;
		});

		describe("Insert character", () => {
			for (const [depth, benchmarkType] of nodeDepths) {
				benchmarkCustom({
					only: false,
					type: benchmarkType,
					title: `insert 1 character into empty string at depth ${depth}`,
					run: async (reporter) => {
						const tree = createConnectedTree();
						registerOpListener(tree, currentTestOps);
						const view = tree.viewWith(viewConfig);
						view.initialize(makeDeepTextTree(depth, ""));
						currentTestOps.length = 0; // discard initialization ops

						const textNode = getLeafTextNode(view.root);
						textNode.insertAt(0, "a");

						assert.equal(textNode.characterCount(), 1);
						const opStats = getOperationsStats(currentTestOps);
						for (const key of Object.keys(opStats)) {
							reporter.addMeasurement(key, opStats[key]);
						}
					},
				});
			}
		});

		describe("Remove character", () => {
			for (const [depth, benchmarkType] of nodeDepths) {
				benchmarkCustom({
					only: false,
					type: benchmarkType,
					title: `remove 1 character from string of 1 character at depth ${depth}`,
					run: async (reporter) => {
						const tree = createConnectedTree();
						registerOpListener(tree, currentTestOps);
						const view = tree.viewWith(viewConfig);
						view.initialize(makeDeepTextTree(depth, "a"));
						currentTestOps.length = 0; // discard initialization ops

						const textNode = getLeafTextNode(view.root);
						textNode.removeRange(0, 1);

						assert.equal(textNode.characterCount(), 0);
						const opStats = getOperationsStats(currentTestOps);
						for (const key of Object.keys(opStats)) {
							reporter.addMeasurement(key, opStats[key]);
						}
					},
				});
			}
		});
	});

	// TODO: formatted text benchmarks.
});
