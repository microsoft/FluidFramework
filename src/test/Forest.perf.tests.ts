/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { v4 } from 'uuid';

import { assert } from '../Common';
import { Side, Snapshot, SnapshotNode } from '../Snapshot';
import { Definition, NodeId, TraitLabel } from '../Identifiers';
import { ChangeNode } from '../generic';

describe('Forest Perf', () => {
	for (const count of [100, 1_000, 10_000, 100_000]) {
		// Pick a single representative size for the 'Measurement' suite to keep it small.
		const type = count === 10_000 ? BenchmarkType.Measurement : BenchmarkType.Perspective;

		benchmark({
			type,
			title: `${count} random inserts in Snapshot`,
			benchmarkFn: () => {
				buildRandomTree(count);
			},
		});

		let built: Snapshot | undefined;
		let rootId: NodeId | undefined;
		benchmark({
			type,
			title: `walk ${count} node Snapshot`,
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

function walk(s: Snapshot, id: NodeId): number {
	let count = 1;
	const n = s.getSnapshotNode(id);
	for (const [_label, v] of n.traits.entries()) {
		for (const child of v) {
			count += walk(s, child);
		}
	}
	return count;
}

function buildRandomTree(size: number): [Snapshot, NodeId] {
	function getId(): NodeId {
		return v4() as NodeId;
	}

	function getLabel(): TraitLabel {
		return v4() as TraitLabel;
	}

	const rootId = getId();
	const root: ChangeNode = { traits: {}, definition: v4() as Definition, identifier: rootId };
	const ids = [rootId];
	let f = Snapshot.fromTree(root);

	for (let i = 1; i < size; i++) {
		const label = getLabel();
		const def: Definition = v4() as Definition;
		const id = getId();

		const newNode: SnapshotNode = {
			identifier: id,
			definition: def,
			traits: new Map<TraitLabel, readonly NodeId[]>(),
		};

		f = f.addNodes([newNode]);
		const parent = ids[Math.floor(Math.random() * ids.length)];
		f = f.attachRange([id], { trait: { parent, label }, side: Side.Before });
		ids.push(id);
	}
	return [f, rootId];
}
