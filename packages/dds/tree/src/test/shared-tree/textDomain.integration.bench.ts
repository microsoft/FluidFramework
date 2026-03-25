/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { BenchmarkType, benchmarkCustom } from "@fluid-tools/benchmark";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import type { ITreePrivate } from "../../shared-tree/index.js";
import { TreeViewConfiguration, type TreeView } from "../../simple-tree/index.js";
import { TextAsTree } from "../../text/index.js";
import { configureBenchmarkHooks } from "../utils.js";

import {
	createConnectedTree,
	getOperationsStats,
	registerOpListener,
} from "./opBenchmarkUtilities.js";

function createLongString(length: number = 1000): string {
	return "a".repeat(length);
}

function initializeTextTree(
	tree: ITreePrivate,
	initialContent: string,
): TreeView<typeof TextAsTree.Tree> {
	const config = new TreeViewConfiguration({ schema: TextAsTree.Tree });
	const view = tree.viewWith(config);
	view.initialize(TextAsTree.Tree.fromString(initialContent));
	return view;
}

describe("TextDomain integration benchmarks", () => {
	configureBenchmarkHooks();

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

		describe("Insert character", () => {
			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: "insert 1 character into empty string",
				run: async (reporter) => {
					const tree = createConnectedTree();
					registerOpListener(tree, currentTestOps);
					const view = initializeTextTree(tree, "");
					currentTestOps.length = 0; // discard initialization ops

					view.root.insertAt(0, "a");

					assert.equal(view.root.characterCount(), 1);
					const opStats = getOperationsStats(currentTestOps);
					for (const key of Object.keys(opStats)) {
						reporter.addMeasurement(key, opStats[key]);
					}
				},
			});

			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: "insert 1 character into long string (1000 characters)",
				run: async (reporter) => {
					const tree = createConnectedTree();
					registerOpListener(tree, currentTestOps);
					const view = initializeTextTree(tree, createLongString(1000));
					currentTestOps.length = 0; // discard initialization ops

					view.root.insertAt(500, "a");

					assert.equal(view.root.characterCount(), 1001);
					const opStats = getOperationsStats(currentTestOps);
					for (const key of Object.keys(opStats)) {
						reporter.addMeasurement(key, opStats[key]);
					}
				},
			});
		});

		describe("Remove character", () => {
			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: "remove 1 character from short string (1 character)",
				run: async (reporter) => {
					const tree = createConnectedTree();
					registerOpListener(tree, currentTestOps);
					const view = initializeTextTree(tree, "a");
					currentTestOps.length = 0; // discard initialization ops

					view.root.removeRange(0, 1);

					assert.equal(view.root.characterCount(), 0);
					const opStats = getOperationsStats(currentTestOps);
					for (const key of Object.keys(opStats)) {
						reporter.addMeasurement(key, opStats[key]);
					}
				},
			});

			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: "remove 1 character from long string (1000 characters)",
				run: async (reporter) => {
					const tree = createConnectedTree();
					registerOpListener(tree, currentTestOps);
					const view = initializeTextTree(tree, createLongString(1000));
					currentTestOps.length = 0; // discard initialization ops

					view.root.removeRange(500, 501);

					assert.equal(view.root.characterCount(), 999);
					const opStats = getOperationsStats(currentTestOps);
					for (const key of Object.keys(opStats)) {
						reporter.addMeasurement(key, opStats[key]);
					}
				},
			});
		});
	});

	// TODO: formatted text benchmarks.
});
