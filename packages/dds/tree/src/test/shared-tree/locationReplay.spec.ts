/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	type DeltaFieldMap,
	type DeltaMark,
	type DeltaRoot,
	type FieldKey,
	type UpPath,
	rootFieldKey,
	makeDetachedFieldIndex,
} from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { LocationReplay, rewindDetachedRoots } from "../../shared-tree/locationReplay.js";
import { brand } from "../../util/index.js";

const array: UpPath = { parent: undefined, parentField: rootFieldKey, parentIndex: 0 };

function fieldDelta(marks: readonly DeltaMark[]): DeltaFieldMap {
	return new Map([
		[rootFieldKey, { marks: [{ count: 1, fields: new Map([[EmptyKey, { marks }]]) }] }],
	]);
}

describe("LocationReplay", () => {
	it("tracks virtual end gaps and deletion collapse without creating any forest", () => {
		const detached = makeDetachedFieldIndex();
		for (let i = 0; i < 3; i++) {
			detached.createEntry({ minor: i }, undefined);
		}
		const replay = new LocationReplay(detached);
		const before = replay.track(array, { index: 0, affinity: "before" });
		const after = replay.track(array, { index: 0, affinity: "after" });
		replay.apply({ fields: fieldDelta([{ count: 3, attach: { minor: 0 } }]) }, "root");
		assert.deepEqual(replay.snapshot(after), array);
		assert.equal(before.gap?.index, 0);
		assert.equal(after.gap?.index, 3);
		replay.apply({ fields: fieldDelta([{ count: 3, detach: { minor: 4 } }]) }, "root");
		assert.equal(before.gap?.index, 0);
		assert.equal(after.gap?.index, 0);
		replay.dispose();
	});

	it("uses core anchors through detached-root rename chains", () => {
		const replay = new LocationReplay(makeDetachedFieldIndex());
		const node = replay.track(array);
		replay.apply(
			{
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, detach: { minor: 0 } },
								{ count: 1, attach: { minor: 2 } },
							],
						},
					],
				]),
				rename: [
					{ oldId: { minor: 0 }, newId: { minor: 1 }, count: 1 },
					{ oldId: { minor: 1 }, newId: { minor: 2 }, count: 1 },
				],
			},
			"root",
		);
		assert.deepEqual(replay.snapshot(node), array);
		replay.dispose();
	});

	it("can seed repair roots that predate the replay and rename them before attaching", () => {
		const detached = makeDetachedFieldIndex();
		detached.createEntry({ minor: 0 }, undefined);
		const replay = new LocationReplay(detached);
		const gap = replay.track(array, { index: 1, affinity: "after" });
		replay.apply(
			{
				fields: fieldDelta([{ count: 1, attach: { minor: 2 } }]),
				rename: [{ oldId: { minor: 0 }, newId: { minor: 2 }, count: 1 }],
			},
			"root",
		);
		assert.equal(gap.gap?.index, 2);
		replay.dispose();
	});

	it("follows a node moved across fields using the anchor visitor", () => {
		const left: FieldKey = brand("left");
		const right: FieldKey = brand("right");
		const replay = new LocationReplay(makeDetachedFieldIndex());
		const node = replay.track({ parent: array, parentField: left, parentIndex: 0 });
		replay.apply(
			{
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{
									count: 1,
									fields: new Map([
										[left, { marks: [{ count: 1, detach: { minor: 0 } }] }],
										[right, { marks: [{ count: 1, attach: { minor: 0 } }] }],
									]),
								},
							],
						},
					],
				]),
			},
			"root",
		);
		assert.deepEqual(replay.snapshot(node), {
			parent: array,
			parentField: right,
			parentIndex: 0,
		});
		replay.dispose();
	});

	for (const intermediateExisted of [false, true]) {
		it(`reconstructs the correct repair state when an intermediate rename ID ${intermediateExisted ? "existed" : "did not exist"}`, () => {
			const delta: DeltaRoot = {
				fields: new Map([
					[
						rootFieldKey,
						{
							marks: [
								{ count: 1, detach: { minor: 0 } },
								{ count: 1, attach: { minor: 2 } },
							],
						},
					],
				]),
				rename: [
					{ oldId: { minor: 0 }, newId: { minor: 1 }, count: 1 },
					{ oldId: { minor: 1 }, newId: { minor: 2 }, count: 1 },
				],
			};
			const current = makeDetachedFieldIndex();
			if (intermediateExisted) {
				current.createEntry({ minor: 1 }, undefined);
			}
			rewindDetachedRoots(current, delta);
			assert.equal(current.tryGetEntry({ minor: 1 }) !== undefined, intermediateExisted);
			assert.equal(current.tryGetEntry({ minor: 0 }), undefined);
			assert.equal(current.tryGetEntry({ minor: 2 }), undefined);
			const replay = new LocationReplay(current);
			const node = replay.track(array);
			replay.apply(delta, "root");
			assert.deepEqual(replay.snapshot(node), intermediateExisted ? undefined : array);
			replay.dispose();
		});
	}
});
