/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'assert';

import {
	BenchmarkType,
	TestType,
	benchmarkDuration,
	benchmarkIt,
	collectDurationData,
	isInPerformanceTestingMode,
} from '@fluid-tools/benchmark';
import { v4 } from 'uuid';

import { Forest, ForestNode } from '../Forest.js';
import { Definition, NodeId, TraitLabel } from '../Identifiers.js';
import { RevisionView } from '../RevisionView.js';
import { TreeViewNode } from '../TreeView.js';
import { ChangeNode, Side } from '../persisted-types/index.js';

import { TestTree } from './utilities/TestNode.js';
import { refreshTestTree } from './utilities/TestUtilities.js';

describe('Forest Perf', () => {
	const testTree = refreshTestTree();
	// Larger sizes can slow down correctness test runs, or even time out, so only run smaller sizes as correctness tests.
	const sizes = isInPerformanceTestingMode ? [100, 1_000, 10_000, 100_000] : [100, 1_000];

	for (const count of sizes) {
		// Pick a single representative size for the 'Measurement' suite to keep it small.
		const type = count === 10_000 ? BenchmarkType.Measurement : BenchmarkType.Perspective;

		benchmarkIt({
			type,
			title: `${count} random inserts in TreeView`,
			...benchmarkDuration({ benchmarkFn: () => buildRandomTree(testTree, count) }),
		});

		benchmarkIt({
			type,
			testType: TestType.ExecutionTime,
			title: `walk ${count} node TreeView`,
			run: async () => {
				const [built, rootId] = buildRandomTree(testTree, count);
				return collectDurationData({
					benchmarkFn: () => {
						const nodes = walk(built, rootId);
						assert(nodes === count);
					},
				});
			},
		});

		benchmarkIt({
			type,
			testType: TestType.ExecutionTime,
			title: `insert ${count} nodes into Forest`,
			run: async () => {
				const forest = Forest.create(true);
				const nodes: ForestNode[] = [];
				for (let i = 0; i < count; i++) {
					nodes.push(makeTestForestNode(testTree));
				}
				return collectDurationData({
					benchmarkFn: () => {
						forest.add(nodes);
					},
				});
			},
		});

		for (const otherCount of sizes) {
			benchmarkIt({
				type,
				testType: TestType.ExecutionTime,
				title: `invoke delta on Forest with ${count} nodes against Forest with ${otherCount} nodes`,
				run: async () => {
					let forest = Forest.create(true);
					let otherForest = Forest.create(true);
					const nodes: ForestNode[] = [];
					for (let i = 0; i < count; i++) {
						nodes.push(makeTestForestNode(testTree));
					}
					forest = forest.add(nodes);

					const otherNodes: ForestNode[] = [];
					for (let i = 0; i < otherCount; i++) {
						otherNodes.push(makeTestForestNode(testTree));
					}
					otherForest = otherForest.add(otherNodes);
					return collectDurationData({
						benchmarkFn: () => {
							forest.delta(otherForest);
						},
					});
				},
			});
		}
	}
});

function walk(s: RevisionView, id: NodeId): number {
	let count = 1;
	const n = s.getViewNode(id);
	for (const [_label, v] of n.traits.entries()) {
		for (const child of v) {
			count += walk(s, child);
		}
	}
	return count;
}

function buildRandomTree(testTree: TestTree, size: number): [RevisionView, NodeId] {
	function getId(): NodeId {
		return testTree.generateNodeId();
	}

	function getLabel(): TraitLabel {
		return v4() as TraitLabel;
	}

	const rootId = getId();
	const root: ChangeNode = { traits: {}, definition: v4() as Definition, identifier: rootId };
	const ids = [rootId];
	let f = RevisionView.fromTree(root).openForTransaction();

	for (let i = 1; i < size; i++) {
		const label = getLabel();
		const def: Definition = v4() as Definition;
		const id = getId();

		const newNode: TreeViewNode = {
			identifier: id,
			definition: def,
			traits: new Map<TraitLabel, readonly NodeId[]>(),
		};

		f = f.addNodes([newNode]);
		const parent = ids[Math.floor(Math.random() * ids.length)];
		f = f.attachRange([id], { trait: { parent, label }, side: Side.Before });
		ids.push(id);
	}
	return [f.close(), rootId];
}

function makeTestForestNode(testTree: TestTree): ForestNode {
	return { ...testTree.buildLeaf(testTree.generateNodeId()), traits: new Map() };
}
