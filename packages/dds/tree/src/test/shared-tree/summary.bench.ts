/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IsoBuffer } from "@fluid-internal/client-utils";
import {
	BenchmarkType,
	benchmarkCustom,
	benchmark,
	type IMeasurementReporter,
} from "@fluid-tools/benchmark";
import type { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import type { ITree } from "@fluidframework/driver-definitions/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils/internal";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { TestTreeProviderLite, configureBenchmarkHooks, testIdCompressor } from "../utils.js";
import { TreeViewConfiguration, type ImplicitFieldSchema } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { TreeSimpleContentTyped } from "../feature-libraries/flex-tree/utils.js";
import {
	LinkedList,
	makeJsDeepTree,
	makeJsWideTreeWithEndValue,
	WideRoot,
} from "../scalableTestTrees.js";
import { TreeFactory } from "../../treeFactory.js";

// TODO: these tests currently only cover tree content.
// It might make sense to extend them to cover complex collaboration windows.

// number of nodes in test for wide trees
const nodesCountWide: [numberOfNodes: number, minLength: number, maxLength: number][] = [
	[1, 1000, 7000],
	[10, 1000, 10000],
	[100, 1000, 500000],
];
// number of nodes in test for deep trees
const nodesCountDeep: [numberOfNodes: number, minLength: number, maxLength: number][] = [
	[10, 1000, 25000],
	[100, 1000, 1000000],
	[200, 1000, 5000000],
];

describe("Summary benchmarks", () => {
	configureBenchmarkHooks();
	// TODO: report these sizes as benchmark output which can be tracked over time.
	describe("size of", () => {
		it("an empty tree.", async () => {
			const provider = new TestTreeProviderLite();
			const tree = provider.trees[0];
			const { summary } = tree.getAttachSummary(true);
			const summaryString = JSON.stringify(summary);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			assert(summarySize < 700);
		});

		function processSummary(
			summaryTree: ISummaryTree,
			reporter: IMeasurementReporter,
			minLength: number,
			maxLength: number,
		) {
			const summaryString = JSON.stringify(summaryTree);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			reporter.addMeasurement("summarySize", summarySize);
			assert(summarySize > minLength);
			assert(summarySize < maxLength);
		}

		for (const [numberOfNodes, minLength, maxLength] of nodesCountWide) {
			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: `a wide tree with ${numberOfNodes} nodes.`,
				run: async (reporter) => {
					const summaryTree = getSummaryTree({
						initialTree: makeJsWideTreeWithEndValue(numberOfNodes, 1),
						schema: WideRoot,
					});
					processSummary(summaryTree, reporter, minLength, maxLength);
				},
			});
		}
		for (const [numberOfNodes, minLength, maxLength] of nodesCountDeep) {
			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: `a deep tree with ${numberOfNodes} nodes.`,
				run: async (reporter) => {
					const summaryTree = getSummaryTree({
						// Types do not allow implicitly constructing recursive types, so cast is required.
						// TODO: Find a better alternative.
						initialTree: makeJsDeepTree(numberOfNodes, 1) as LinkedList,
						schema: LinkedList,
					});
					processSummary(summaryTree, reporter, minLength, maxLength);
				},
			});
		}
	});

	describe("load speed of", () => {
		function runSummaryBenchmark<T extends ImplicitFieldSchema>(
			title: string,
			content: TreeSimpleContentTyped<T>,
			type: BenchmarkType,
		) {
			let summaryTree: ITree;
			const factory = new TreeFactory({});
			benchmark({
				title,
				type,
				before: () => {
					summaryTree = convertSummaryTreeToITree(getSummaryTree(content));
				},
				benchmarkFnAsync: async () => {
					const services: IChannelServices = {
						deltaConnection: new MockDeltaConnection(
							() => 0,
							() => {},
						),
						objectStorage: new MockStorage(summaryTree),
					};
					const datastoreRuntime = new MockFluidDataStoreRuntime({
						idCompressor: testIdCompressor,
					});
					await factory.load(datastoreRuntime, "test", services, factory.attributes);
				},
			});
		}

		for (const [nodeCount, type] of [
			[1, BenchmarkType.Perspective],
			[10, BenchmarkType.Perspective],
			[100, BenchmarkType.Measurement],
		]) {
			runSummaryBenchmark(
				`a deep tree with ${nodeCount} nodes}`,
				{
					// Types do not allow implicitly constructing recursive types, so cast is required.
					// TODO: Find a better alternative.
					initialTree: makeJsDeepTree(nodeCount, 1) as LinkedList,
					schema: LinkedList,
				},
				type,
			);
		}

		for (const [nodeCount, type] of [
			[10, BenchmarkType.Perspective],
			[100, BenchmarkType.Measurement],
		]) {
			runSummaryBenchmark(
				`a wide tree with ${nodeCount} nodes}`,
				{
					initialTree: makeJsWideTreeWithEndValue(nodeCount, 1),
					schema: WideRoot,
				},
				type,
			);
		}
	});
});

/**
 * @param content - content to full the tree with
 * @returns the tree's summary
 */
function getSummaryTree<T extends ImplicitFieldSchema>(
	content: TreeSimpleContentTyped<T>,
): ISummaryTree {
	const provider = new TestTreeProviderLite();
	const tree = provider.trees[0];
	const view = tree.kernel.viewWith(new TreeViewConfiguration({ schema: content.schema }));
	view.initialize(content.initialTree);
	provider.processMessages();
	const { summary } = tree.getAttachSummary(true);
	return summary;
}
