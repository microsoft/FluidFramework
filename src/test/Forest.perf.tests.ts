/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { v4 } from 'uuid';

import { assert } from '../Common';
import { RevisionView, Side, TreeViewNode } from '../TreeView';
import { Definition, NodeId, TraitLabel } from '../Identifiers';
import { ChangeNode } from '../generic';

describe('Forest Perf', () => {
	for (const count of [100, 1_000, 10_000, 100_000]) {
		// Pick a single representative size for the 'Measurement' suite to keep it small.
		const type = count === 10_000 ? BenchmarkType.Measurement : BenchmarkType.Perspective;

		benchmark({
			type,
			title: `${count} random inserts in TreeView`,
			benchmarkFn: () => {
				buildRandomTree(count);
			},
		});

		let built: RevisionView | undefined;
		let rootId: NodeId | undefined;
		benchmark({
			type,
			title: `walk ${count} node TreeView`,
			before: () => {
				[built, rootId] = buildRandomTree(count);
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

function buildRandomTree(size: number): [RevisionView, NodeId] {
	function getId(): NodeId {
		return v4() as NodeId;
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
