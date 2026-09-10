/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { RevertibleStatus, type Revertible } from "../../../core/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeViewAlpha,
} from "../../../simple-tree/index.js";
import { getView } from "../../utils.js";

const schema = new SchemaFactory("revertTo-sequences");
class Item extends schema.object("Item", { id: schema.number, v: schema.number }) {}
class Items extends schema.array("Items", Item) {}
class Root extends schema.object("Root", { a: Items, b: Items, c: Items }) {}

function initialContent() {
	return {
		a: [0, 1, 2, 3, 4].map((id) => ({ id, v: id })),
		b: [5, 6, 7].map((id) => ({ id, v: id })),
		c: [],
	};
}

function content(view: TreeViewAlpha<typeof Root>) {
	const copy = (items: Items) => items.map(({ id, v }) => ({ id, v }));
	return { a: copy(view.root.a), b: copy(view.root.b), c: copy(view.root.c) };
}

function setup() {
	const view = getView(new TreeViewConfiguration({ schema: Root }));
	view.initialize(initialContent());
	const target = view.branchHistory.getHead()?.revision;
	assert(target !== undefined);
	const handles: Revertible[] = [];
	const forks: TreeViewAlpha<typeof Root>[] = [];
	let latest: Revertible | undefined;
	const unsubscribe = view.events.on("changed", (_, getRevertible) => {
		if (getRevertible !== undefined) {
			latest = getRevertible();
			handles.push(latest);
		}
	});
	return {
		view,
		target,
		fork() {
			const fork = view.fork();
			forks.push(fork);
			return fork;
		},
		revertLatest() {
			assert(latest !== undefined, "Expected a synchronously captured revertible");
			latest.revert();
		},
		dispose() {
			unsubscribe();
			for (const handle of handles) {
				if (handle.status !== RevertibleStatus.Disposed) {
					handle.dispose();
				}
			}
			for (const fork of forks) {
				fork.dispose();
			}
			view.dispose();
		},
	};
}

function assertRestoreRoundTrip(fixture: ReturnType<typeof setup>) {
	const { view, target } = fixture;
	const before = content(view);
	const historyLength = view.branchHistory.length;
	view.revertTo(target);
	assert.deepEqual(content(view), initialContent());
	assert.equal(view.branchHistory.length, historyLength + 1);
	fixture.revertLatest();
	assert.deepEqual(content(view), before);
	assert.equal(view.branchHistory.length, historyLength + 2);
	fixture.revertLatest();
	assert.deepEqual(content(view), initialContent());
	assert.equal(view.branchHistory.length, historyLength + 3);
}

function editBeforeRepeatedRestore(view: TreeViewAlpha<typeof Root>) {
	view.runTransaction(() => {
		view.root.c.insertAt(0, { id: 100, v: 0 }, { id: 101, v: 0 });
	});
	view.runTransaction(() => {
		view.root.a.insertAt(3, { id: 102, v: 0 });
	});
	view.runTransaction(() => {
		view.root.a.insertAt(0, { id: 103, v: 0 }, { id: 104, v: 0 }, { id: 105, v: 0 });
	});
	// Preserve the no-op transaction: Undo must use the actual latest changed-event factory.
	view.runTransaction(() => {
		view.root.c.moveRangeToIndex(0, 0, 2, view.root.c);
	});
}

function editPeer(view: TreeViewAlpha<typeof Root>) {
	view.runTransaction(() => {
		view.root.a.moveRangeToIndex(0, 0, 2, view.root.c);
	});
	view.runTransaction(() => {
		view.root.b[1].v = 106;
	});
}

function interleaveInsertions(view: TreeViewAlpha<typeof Root>, count: number) {
	view.runTransaction(() => {
		for (let index = count - 1; index > 0; index--) {
			view.root.a.insertAt(index, { id: count + index, v: 0 });
		}
	});
}

describe("revertTo sequence changes", () => {
	let fixture: ReturnType<typeof setup>;
	beforeEach(() => {
		fixture = setup();
	});
	afterEach(() => {
		fixture.dispose();
	});

	it("restores consecutive insertion commits", () => {
		fixture.view.runTransaction(() => {
			fixture.view.root.c.insertAtEnd({ id: 100, v: 0 });
		});
		fixture.view.runTransaction(() => {
			fixture.view.root.c.insertAtEnd({ id: 101, v: 0 });
		});
		assertRestoreRoundTrip(fixture);
	});

	it("restores consecutive removal commits", () => {
		fixture.view.root.a.removeRange(1, 3);
		fixture.view.root.a.removeAt(0);
		assertRestoreRoundTrip(fixture);
	});

	it("restores chained cross-field moves with nested edits", () => {
		const { root } = fixture.view;
		root.b.moveRangeToIndex(1, 1, 4, root.a);
		root.c.moveRangeToIndex(0, 2, 4, root.b);
		root.c[1].v = 100;
		assertRestoreRoundTrip(fixture);
	});

	it("restores replaced roots with scalar edits", () => {
		fixture.view.root = { a: [], b: [], c: [{ id: 100, v: 0 }] };
		fixture.view.root.c[0].v = 101;
		fixture.view.root = { a: [{ id: 102, v: 0 }], b: [], c: [] };
		assertRestoreRoundTrip(fixture);
	});

	it("preserves rollback identities before restoring later edits", () => {
		fixture.view.runTransaction(() => {
			fixture.view.root.c.moveRangeToIndex(0, 1, 4, fixture.view.root.a);
			fixture.view.root.c.removeAt(0);
			return { rollback: true, value: undefined };
		});
		assert.deepEqual(content(fixture.view), initialContent());
		fixture.view.root.c.insertAtEnd({ id: 100, v: 0 });
		fixture.view.root.a.removeAt(2);
		assertRestoreRoundTrip(fixture);
	});

	for (const restoreFirst of [true, false]) {
		it(`restores again after Undo and peer edits (${restoreFirst ? "restore" : "peer"} merged first)`, () => {
			const { view, target } = fixture;
			editBeforeRepeatedRestore(view);
			fixture.revertLatest();
			const prepared = fixture.fork();
			prepared.revertTo(target);
			const peer = fixture.fork();
			editPeer(peer);
			view.merge(restoreFirst ? prepared : peer, false);
			view.merge(restoreFirst ? peer : prepared, false);
			peer.rebaseOnto(view);
			assert.deepEqual(content(peer), content(view));
			assertRestoreRoundTrip(fixture);
		});
	}

	it("restores again after peer edits without an initial Undo", () => {
		const { view, target } = fixture;
		editBeforeRepeatedRestore(view);
		const prepared = fixture.fork();
		prepared.revertTo(target);
		const peer = fixture.fork();
		editPeer(peer);
		view.merge(prepared, false);
		view.merge(peer, false);
		peer.rebaseOnto(view);
		assert.deepEqual(content(peer), content(view));
		assertRestoreRoundTrip(fixture);
	});

	it("restores a move fragmented by thousands of concurrent insertions", function () {
		this.timeout(30_000);
		const { view } = fixture;
		const source = Array.from({ length: 4000 }, (_, id) => ({ id, v: id }));
		view.root = { a: source, b: [], c: [] };
		const moving = fixture.fork();
		moving.root.c.moveRangeToIndex(0, 0, 4000, moving.root.a);
		interleaveInsertions(view, 4000);
		const target = view.branchHistory.getHead()?.revision;
		assert(target !== undefined);
		const expected = content(view);
		view.merge(moving, false);
		const moved = content(view);
		assert.deepEqual(moved.c, source);
		assert.equal(moved.a.length, 3999);
		view.revertTo(target);
		assert.deepEqual(content(view), expected);
		fixture.revertLatest();
		assert.deepEqual(content(view), moved);
		fixture.revertLatest();
		assert.deepEqual(content(view), expected);
	});
});
