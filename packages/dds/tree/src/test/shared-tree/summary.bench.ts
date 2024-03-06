/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IsoBuffer } from "@fluid-internal/client-utils";
import { ISummaryTree, ITree } from "@fluidframework/protocol-definitions";
import { IChannelServices } from "@fluidframework/datastore-definitions";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { SharedTreeFactory, TreeContent } from "../../shared-tree/index.js";
import { TestTreeProviderLite, schematizeFlexTree, testIdCompressor } from "../utils.js";
import { AllowedUpdateType } from "../../core/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import { makeDeepContent, makeWideContentWithEndValue } from "../scalableTestTrees.js";

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
		for (const [numberOfNodes, minLength, maxLength] of nodesCountWide) {
			it(`a wide tree with ${numberOfNodes} nodes.`, async () => {
				const summaryTree = getSummaryTree(makeWideContentWithEndValue(numberOfNodes, 1));
				const summaryString = JSON.stringify(summaryTree);
				const summarySize = IsoBuffer.from(summaryString).byteLength;
				assert(summarySize > minLength);
				assert(summarySize < maxLength);
			});
		}
		for (const [numberOfNodes, minLength, maxLength] of nodesCountDeep) {
			it(`a deep tree with ${numberOfNodes} nodes.`, async () => {
				const summaryTree = getSummaryTree(makeDeepContent(numberOfNodes));
				const summaryString = JSON.stringify(summaryTree);
				const summarySize = IsoBuffer.from(summaryString).byteLength;
				assert(summarySize > minLength);
				assert(summarySize < maxLength);
			});
		}
	});

	describe("load speed of", () => {
		function runSummaryBenchmark(title: string, content: TreeContent, type: BenchmarkType) {
			let summaryTree: ITree;
			const factory = new SharedTreeFactory({ jsonValidator: typeboxValidator });
			benchmark({
				title,
				type,
				before: async () => {
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
				makeDeepContent(nodeCount),
				type,
			);
		}

		for (const [nodeCount, type] of [
			[10, BenchmarkType.Perspective],
			[100, BenchmarkType.Measurement],
		]) {
			runSummaryBenchmark(
				`a wide tree with ${nodeCount} nodes}`,
				makeWideContentWithEndValue(nodeCount, 1),
				type,
			);
		}
	});
});

/**
 * @param content - content to full the tree with
 * @returns the tree's summary
 */
function getSummaryTree(content: TreeContent): ISummaryTree {
	const provider = new TestTreeProviderLite();
	const tree = provider.trees[0];
	schematizeFlexTree(tree, {
		...content,
		allowedSchemaModifications: AllowedUpdateType.Initialize,
	});
	provider.processMessages();
	const { summary } = tree.getAttachSummary(true);
	return summary;
}
