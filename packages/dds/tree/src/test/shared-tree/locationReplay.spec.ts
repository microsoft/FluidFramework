/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	EmptyKey,
	type DeltaFieldMap,
	type DeltaMark,
	type FieldKey,
	type UpPath,
	type ReadOnlyDetachedFieldIndex,
	type RevertibleAlpha,
	rootFieldKey,
	makeDetachedFieldIndex,
	applyDelta,
	createAnnouncedVisitor,
	tagChange,
} from "../../core/index.js";
import { intoDelta } from "../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { LocationReplay, rewindDetachedRoots } from "../../shared-tree/locationReplay.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { brand } from "../../util/index.js";
import { getView, mintRevisionTag } from "../utils.js";

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
		it(`tracks renames when an intermediate ID ${intermediateExisted ? "existed" : "did not exist"}`, () => {
			const current = makeDetachedFieldIndex();
			if (intermediateExisted) {
				current.createEntry({ minor: 1 }, undefined);
			}
			const replay = new LocationReplay(current);
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
			assert.deepEqual(replay.snapshot(node), intermediateExisted ? undefined : array);
			replay.dispose();
		});
	}
});

describe("rewindDetachedRoots", () => {
	const sf = new SchemaFactory("com.example.rewindDetachedRoots");
	class Text extends sf.array("Text", sf.string) {}
	class Document extends sf.object("Document", { left: Text, right: Text }) {}
	const identities = (index: ReadOnlyDetachedFieldIndex): string[] =>
		[...index.clone().entries()].map(({ id }) => JSON.stringify([id.major, id.minor])).sort();

	for (const operation of [
		"insert",
		"remove",
		"move",
		"transient",
		"replace",
		"restore",
	] as const) {
		it(`restores repair identities and permits forward replay after ${operation}`, () => {
			const view = getView(new TreeViewConfiguration({ schema: Document }));
			view.initialize({ left: ["a", "b", "c"], right: ["x", "y"] });
			let restore: RevertibleAlpha | undefined;
			const off = view.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					restore = metadata.getRevertible();
				}
			});
			view.root.left.removeAt(2);
			off();
			assert(restore !== undefined);
			const checkout = view.checkout;
			const before = identities(checkout.removedRoots);
			const base = checkout.mainBranch.getHead();
			switch (operation) {
				case "insert": {
					view.root.left.insertAt(1, "new");
					break;
				}
				case "remove": {
					view.root.left.removeRange();
					break;
				}
				case "move": {
					view.root.right.moveRangeToIndex(1, 0, 2, view.root.left);
					break;
				}
				case "transient": {
					view.runTransaction(() => {
						view.root.left.insertAt(1, "new");
						view.root.right.moveToStart(1, view.root.left);
						view.root.right.removeAt(0);
					});
					break;
				}
				case "replace": {
					view.root.left = new Text(["replacement"]);
					break;
				}
				case "restore": {
					restore.revert();
					break;
				}
				default: {
					assert.fail("Unknown operation");
				}
			}
			const commit = checkout.mainBranch.getHead();
			assert.equal(commit.parent, base);
			const after = identities(checkout.removedRoots);
			const rewound = checkout.removedRoots.clone();
			rewindDetachedRoots(
				rewound,
				commit,
				checkout.mainBranch.changeFamily.rebaser,
				mintRevisionTag(),
			);
			assert.deepEqual(identities(rewound), before);
			for (const change of commit.change.changes) {
				assert(change.type === "data");
				const delta = intoDelta(tagChange(change.innerChange, commit.revision));
				try {
					applyDelta(
						delta,
						commit.revision,
						{
							acquireVisitor: () => createAnnouncedVisitor({}),
						},
						rewound,
					);
				} finally {
					for (const { trees } of [...(delta.build ?? []), ...(delta.refreshers ?? [])]) {
						trees.referenceRemoved();
					}
				}
			}
			assert.deepEqual(identities(rewound), after);
			view.dispose();
		});
	}
});
