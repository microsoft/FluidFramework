/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { asAlpha } from "../../../api.js";
import type { RevertibleAlpha } from "../../../core/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeArrayNode,
	type TreePositionResolver,
	type TreeViewAlpha,
} from "../../../simple-tree/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import { TestTreeProviderLite } from "../../utils.js";

const sf = new SchemaFactory("com.example.positions");
class Text extends sf.array("Text", sf.string) {}
class Document extends sf.object("Document", { left: Text, right: Text }) {}
const config = new TreeViewConfiguration({ schema: Document });

function setup(): {
	provider: TestTreeProviderLite;
	views: TreeViewAlpha<typeof Document>[];
} {
	const provider = new TestTreeProviderLite(2);
	const views = provider.trees.map((tree) => tree.kernel.viewWith(config));
	views[0].initialize({ left: ["a", "b", "c", "d"], right: ["x", "y"] });
	provider.synchronizeMessages();
	return { provider, views };
}

function indices(
	resolver: TreePositionResolver,
	revision: string,
	sequence: TreeArrayNode,
	positions: readonly number[],
	affinity: "before" | "after" = "after",
): readonly number[] {
	const result = resolver.resolvePositions(
		revision,
		positions.map((index) => ({ sequence, index, affinity })),
	);
	assert.equal(result.status, "resolved");
	if (result.status !== "resolved") {
		assert.fail("Expected a retained revision");
	}
	return result.positions.map((position) => {
		assert.equal(position.status, "resolved");
		if (position.status !== "resolved") {
			assert.fail("Position unavailable");
		}
		return position.index;
	});
}

describe("TreePositionResolver", () => {
	it("shares revision tokens and resolves identity without sorting endpoints", () => {
		const { views } = setup();
		const revision = views[0].positions.getCurrentRevision();
		assert(revision !== undefined);
		assert.equal(views[1].positions.getCurrentRevision(), revision);
		assert.deepEqual(
			indices(views[1].positions, revision, views[1].root.left, [4, 0, 2]),
			[4, 0, 2],
		);
	});

	it("includes pending local insertions and deletions", () => {
		const { views } = setup();
		const receiver = views[1];
		const revision = views[0].positions.getCurrentRevision();
		assert(revision !== undefined);
		receiver.positions.getCurrentRevision();
		receiver.root.left.insertAt(2, "i", "j");
		assert.equal(receiver.positions.getCurrentRevision(), undefined);
		assert.deepEqual(
			indices(receiver.positions, revision, receiver.root.left, [0, 2, 4]),
			[0, 4, 6],
		);
		assert.deepEqual(
			indices(receiver.positions, revision, receiver.root.left, [2], "before"),
			[2],
		);
		receiver.root.left.removeRange(0, 4);
		assert.deepEqual(
			indices(receiver.positions, revision, receiver.root.left, [0, 1, 2, 3, 4]),
			[0, 0, 0, 1, 2],
		);
	});

	it("can initialize the index after edits have already occurred", () => {
		const { views } = setup();
		const revision = views[0].positions.getCurrentRevision();
		assert(revision !== undefined);
		views[1].root.left.insertAtStart("z");
		assert.deepEqual(indices(views[1].positions, revision, views[1].root.left, [2]), [3]);
	});

	it("follows content moved to another array", () => {
		const { views } = setup();
		const receiver = views[1];
		const revision = views[0].positions.getCurrentRevision();
		assert(revision !== undefined);
		receiver.positions.getCurrentRevision();
		receiver.root.right.moveRangeToIndex(1, 1, 3, receiver.root.left);
		const result = receiver.positions.resolvePositions(revision, [
			{ sequence: receiver.root.left, index: 2, affinity: "after" },
		]);
		assert.equal(result.status, "resolved");
		if (result.status === "resolved") {
			assert.deepEqual(result.positions, [
				{ status: "resolved", sequence: receiver.root.right, index: 2 },
			]);
		}
	});

	it("rejects invalid gaps and foreign revisions explicitly", () => {
		const { views } = setup();
		const view = views[0];
		const revision = view.positions.getCurrentRevision();
		assert(revision !== undefined);
		for (const index of [-1, 5, 1.5, Number.NaN, Infinity]) {
			assert.deepEqual(
				view.positions.resolvePositions(revision, [
					{ sequence: view.root.left, index, affinity: "after" },
				]),
				{
					status: "resolved",
					positions: [{ status: "unavailable", reason: "invalid-position" }],
				},
			);
		}
		assert.deepEqual(view.positions.resolvePositions("not a revision", []), {
			status: "revision-unavailable",
		});
		assert.deepEqual(
			view.positions.resolvePositions(revision.replace('"main"', '"other"'), []),
			{ status: "revision-unavailable" },
		);
		assert.throws(
			() =>
				view.positions.resolvePositions(revision, [
					{ sequence: views[1].root.left, index: 0, affinity: "after" },
				]),
			/must belong to this view/,
		);
	});

	it("does not publish during a transaction or from a local fork", () => {
		const { views } = setup();
		const view = views[0];
		const revision = view.positions.getCurrentRevision();
		assert(revision !== undefined);
		view.runTransaction(() => {
			assert.equal(view.positions.getCurrentRevision(), undefined);
			assert.throws(
				() => view.positions.resolvePositions(revision, []),
				/during a transaction/,
			);
			view.root.left.insertAtStart("z");
		});
		assert.equal(view.positions.getCurrentRevision(), undefined);
		const fork = view.fork();
		assert.equal(fork.positions.getCurrentRevision(), undefined);
		fork.dispose();
	});

	it("replaces the local suffix when remote edits rebase pending changes", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const revision = sender.positions.getCurrentRevision();
		assert(revision !== undefined);
		receiver.positions.getCurrentRevision();
		sender.root.left.insertAtStart("remote");
		receiver.root.left.insertAtEnd("local");
		do {
			provider.synchronizeMessages({ count: 1 });
		} while (sender.positions.getCurrentRevision() === undefined);
		assert.deepEqual([...receiver.root.left], ["remote", "a", "b", "c", "d", "local"]);
		assert.equal(receiver.positions.getCurrentRevision(), undefined);
		assert.deepEqual(
			indices(receiver.positions, revision, receiver.root.left, [2, 4]),
			[3, 6],
		);
		provider.synchronizeMessages();
		assert(receiver.positions.getCurrentRevision() !== undefined);
		assert.equal(
			receiver.positions.getCurrentRevision(),
			sender.positions.getCurrentRevision(),
		);
	});

	it("rejects a future signal until its operations have been applied", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const runtime = provider.trees[1].containerRuntime;
		runtime.connected = false;
		sender.root.left.insertAtEnd("new");
		provider.synchronizeMessages();
		const revision = sender.positions.getCurrentRevision();
		assert(revision !== undefined);
		assert.deepEqual(receiver.positions.resolvePositions(revision, []), {
			status: "revision-unavailable",
		});
		runtime.connected = true;
		provider.synchronizeMessages();
		assert.deepEqual(indices(receiver.positions, revision, receiver.root.left, [5]), [5]);
	});

	it("expires old revisions while retaining a usable current baseline", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const old = sender.positions.getCurrentRevision();
		assert(old !== undefined);
		receiver.positions.getCurrentRevision();
		for (let i = 0; i < 8; i++) {
			sender.root.left.insertAtStart("s");
			receiver.root.right.insertAtStart("r");
			provider.synchronizeMessages();
		}
		assert.deepEqual(receiver.positions.resolvePositions(old, []), {
			status: "revision-unavailable",
		});
		const current = sender.positions.getCurrentRevision();
		assert(current !== undefined);
		assert.deepEqual(
			indices(receiver.positions, current, receiver.root.left, [0, 12]),
			[0, 12],
		);
	});

	it("rejects deleted sequences rather than routing to replacement arrays", () => {
		const { views } = setup();
		const view = views[0];
		const revision = view.positions.getCurrentRevision();
		assert(revision !== undefined);
		const old = view.root.left;
		view.root.left = new Text(["replacement"]);
		assert.deepEqual(
			view.positions.resolvePositions(revision, [
				{ sequence: old, index: 1, affinity: "after" },
			]),
			{
				status: "resolved",
				positions: [{ status: "unavailable", reason: "sequence-deleted" }],
			},
		);
		assert.deepEqual(
			view.positions.resolvePositions(revision, [
				{ sequence: view.root.left, index: 0, affinity: "after" },
			]),
			{
				status: "resolved",
				positions: [{ status: "unavailable", reason: "invalid-position" }],
			},
		);
	});

	it("rejects retained resolver references after view disposal", () => {
		const { views } = setup();
		const resolver = views[0].positions;
		views[0].dispose();
		assert.throws(() => resolver.getCurrentRevision(), /disposed TreeView/);
	});

	it("follows text transferred into a newly created array in a transaction", () => {
		const { views } = setup();
		const view = views[0];
		const revision = view.positions.getCurrentRevision();
		assert(revision !== undefined);
		view.runTransaction(() => {
			view.root.right = new Text([]);
			view.root.right.moveRangeToIndex(0, 1, 3, view.root.left);
		});
		assert.deepEqual(
			view.positions.resolvePositions(revision, [
				{ sequence: view.root.left, index: 2, affinity: "after" },
			]),
			{
				status: "resolved",
				positions: [{ status: "resolved", sequence: view.root.right, index: 1 }],
			},
		);
	});

	it("routes by array identity after the array moves within the document", () => {
		class Paragraphs extends sf.array("Paragraphs", Text) {}
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) =>
			tree.kernel.viewWith(new TreeViewConfiguration({ schema: Paragraphs })),
		);
		views[0].initialize([["a"], ["b", "c"], ["d"]]);
		provider.synchronizeMessages();
		const receiver = views[1];
		const revision = views[0].positions.getCurrentRevision();
		assert(revision !== undefined);
		const paragraph = receiver.root[1];
		receiver.positions.getCurrentRevision();
		receiver.root.moveToStart(1);
		paragraph.insertAtStart("x");
		assert.equal(receiver.root[0], paragraph);
		assert.deepEqual(indices(receiver.positions, revision, paragraph, [0, 1, 2]), [1, 2, 3]);
	});

	it("supports empty arrays and counts elements rather than UTF-16 units", () => {
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) => tree.kernel.viewWith(config));
		views[0].initialize({ left: [], right: ["\u{1F600}", "a"] });
		provider.synchronizeMessages();
		const revision = views[0].positions.getCurrentRevision();
		assert(revision !== undefined);
		views[1].root.left.insertAtStart("x");
		assert.deepEqual(
			indices(views[1].positions, revision, views[1].root.left, [0], "before"),
			[0],
		);
		assert.deepEqual(
			indices(views[1].positions, revision, views[1].root.left, [0], "after"),
			[1],
		);
		assert.deepEqual(indices(views[1].positions, revision, views[1].root.right, [2]), [2]);
	});

	it("leaves the history unchanged when a transaction is aborted", () => {
		const { views } = setup();
		const view = views[0];
		const revision = view.positions.getCurrentRevision();
		assert(revision !== undefined);
		view.runTransaction(() => {
			view.root.left.removeRange();
			return { rollback: true };
		});
		assert.equal(view.positions.getCurrentRevision(), revision);
		assert.deepEqual(indices(view.positions, revision, view.root.left, [0, 2, 4]), [0, 2, 4]);
	});

	it("does not accept an unsequenced local head as a source revision", () => {
		const { views } = setup();
		const view = views[0];
		view.positions.getCurrentRevision();
		view.root.left.insertAtStart("x");
		const local = view.branchHistory.getHead()?.revision;
		assert(local !== undefined);
		assert.deepEqual(view.positions.resolvePositions(JSON.stringify(["main", local]), []), {
			status: "revision-unavailable",
		});
	});

	it("preserves deletion collapse across undo", () => {
		const { views } = setup();
		const view = views[0];
		const revision = view.positions.getCurrentRevision();
		assert(revision !== undefined);
		let undo: RevertibleAlpha | undefined;
		const off = view.events.on("changed", (metadata) => {
			if (metadata.isLocal) {
				undo = metadata.getRevertible();
			}
		});
		view.root.left.removeRange(1, 3);
		off();
		assert(undo !== undefined);
		undo.revert();
		assert.deepEqual([...view.root.left], ["a", "b", "c", "d"]);
		assert.deepEqual(indices(view.positions, revision, view.root.left, [2], "before"), [1]);
		assert.deepEqual(indices(view.positions, revision, view.root.left, [2], "after"), [3]);
	});

	it("reports schema-changing history explicitly", () => {
		const { provider, views } = setup();
		const revision = views[0].positions.getCurrentRevision();
		assert(revision !== undefined);
		views[0].dispose();
		const upgraded = new SchemaFactory("com.example.positions");
		class UpdatedDocument extends upgraded.object("Document", {
			left: Text,
			right: Text,
			title: upgraded.optional(upgraded.string),
		}) {}
		const view = provider.trees[0].kernel.viewWith(
			new TreeViewConfiguration({ schema: UpdatedDocument }),
		);
		view.upgradeSchema();
		assert.deepEqual(
			view.positions.resolvePositions(revision, [
				{ sequence: view.root.left, index: 1, affinity: "after" },
			]),
			{
				status: "resolved",
				positions: [{ status: "unavailable", reason: "unsupported-change" }],
			},
		);
	});

	it("scopes tokens to their shared branch and resolves on shared branches", () => {
		const provider = new TestTreeProviderLite(
			2,
			configuredSharedTree({ enableSharedBranches: true }).getFactory(),
		);
		const main = provider.trees[0].kernel.viewWith(config);
		main.initialize({ left: ["a", "b"], right: [] });
		provider.synchronizeMessages();
		const mainRevision = main.positions.getCurrentRevision();
		assert(mainRevision !== undefined);
		const branch = provider.trees[0].createSharedBranch();
		const first = asAlpha(provider.trees[0].viewSharedBranchWith(branch, config));
		assert.equal(first.positions.getCurrentRevision(), undefined);
		provider.synchronizeMessages();
		const second = asAlpha(provider.trees[1].viewSharedBranchWith(branch, config));
		const revision = first.positions.getCurrentRevision();
		assert(revision !== undefined);
		assert.notEqual(revision, mainRevision);
		assert.equal(second.positions.getCurrentRevision(), revision);
		assert.deepEqual(second.positions.resolvePositions(mainRevision, []), {
			status: "revision-unavailable",
		});
		second.root.left.insertAtStart("x");
		assert.deepEqual(indices(second.positions, revision, second.root.left, [1]), [2]);
		assert.deepEqual(main.positions.resolvePositions(revision, []), {
			status: "revision-unavailable",
		});
	});
});
