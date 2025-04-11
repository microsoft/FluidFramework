/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'assert';

import { BenchmarkType, benchmark, isInPerformanceTestingMode } from '@fluid-tools/benchmark';

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

		benchmark({
			type,
			title: `${count} random inserts in TreeView`,
			benchmarkFn: () => {
				buildRandomTree(testTree, count);
			},
		});

		let built: RevisionView | undefined;
		let rootId: NodeId | undefined;
		benchmark({
			type,
			title: `walk ${count} node TreeView`,
			before: () => {
				[built, rootId] = buildRandomTree(testTree, count);
			},
			benchmarkFn: () => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const nodes = walk(built!, rootId!);
				assert(nodes === count);
			},
			after: () => {
				built = undefined;
				rootId = undefined;
			},
		});

		let forest: Forest | undefined;
		let nodes: ForestNode[];
		benchmark({
			type,
			title: `insert ${count} nodes into Forest`,
			before: () => {
				forest = Forest.create(true);
				nodes = [];
				for (let i = 0; i < count; i++) {
					nodes.push(makeTestForestNode(testTree));
				}
			},
			benchmarkFn: () => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				forest!.add(nodes);
			},
			after: () => {
				forest = undefined;
			},
		});

		let otherForest: Forest | undefined;
		for (const otherCount of sizes) {
			benchmark({
				type,
				title: `invoke delta on Forest with ${count} nodes against Forest with ${otherCount} nodes`,
				before: () => {
					forest = Forest.create(true);
					otherForest = Forest.create(true);
					nodes = [];
					for (let i = 0; i < count; i++) {
						nodes.push(makeTestForestNode(testTree));
					}
					forest = forest.add(nodes);

					const otherNodes: ForestNode[] = [];
					for (let i = 0; i < otherCount; i++) {
						otherNodes.push(makeTestForestNode(testTree));
					}
					otherForest = otherForest.add(otherNodes);
				},
				benchmarkFn: () => {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					forest!.delta(otherForest!);
				},
				after: () => {
					forest = undefined;
					otherForest = undefined;
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
		return crypto.randomUUID() as TraitLabel;
	}

	const rootId = getId();
	const root: ChangeNode = { traits: {}, definition: crypto.randomUUID() as Definition, identifier: rootId };
	const ids = [rootId];
	let f = RevisionView.fromTree(root).openForTransaction();

	for (let i = 1; i < size; i++) {
		const label = getLabel();
		const def: Definition = crypto.randomUUID() as Definition;
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
