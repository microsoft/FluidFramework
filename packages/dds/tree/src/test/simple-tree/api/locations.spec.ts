/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { makeRandom } from "@fluid-private/stochastic-test-utils";

import { asAlpha } from "../../../api.js";
import type { RevertibleAlpha } from "../../../core/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type CapturedTreeLocations,
	type TreeLocation,
	type TreeLocationResolver,
	type TreeLocationResolution,
	type TreeNodeReference,
	type TreePositionRevision,
	type TreeViewAlpha,
} from "../../../simple-tree/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import { TestTreeProviderLite } from "../../utils.js";

const sf = new SchemaFactory("com.example.locations");
class Text extends sf.array("Text", sf.string) {}
class Document extends sf.object("Document", { left: Text, right: Text }) {}
const config = new TreeViewConfiguration({ schema: Document });

function setup(): { provider: TestTreeProviderLite; views: TreeViewAlpha<typeof Document>[] } {
	const provider = new TestTreeProviderLite(2);
	const views = provider.trees.map((tree) => tree.kernel.viewWith(config));
	views[0].initialize({ left: ["a", "b", "c", "d"], right: ["x", "y"] });
	provider.synchronizeMessages();
	return { provider, views };
}

function capture(
	resolver: TreeLocationResolver,
	locations: readonly TreeLocation[],
): CapturedTreeLocations {
	const result = resolver.capture(locations);
	assert(result !== undefined);
	// Model the JSON transport boundary; the resolver must validate the wire encoding.
	return JSON.parse(JSON.stringify(result)) as CapturedTreeLocations;
}

function captureGaps(
	view: TreeViewAlpha<typeof Document>,
	offsets: readonly number[],
	affinity: "before" | "after" = "after",
): CapturedTreeLocations {
	return capture(
		view.locations,
		offsets.map((index) => ({ kind: "sequence", node: view.root.left, index, affinity })),
	);
}

function resolved(result: TreeLocationResolution): readonly TreeLocation[] {
	assert(result.status === "resolved");
	return result.locations.map((entry) => {
		assert(entry.status === "resolved");
		return entry.location;
	});
}

function indices(
	resolver: TreeLocationResolver,
	batch: CapturedTreeLocations,
): readonly number[] {
	return resolved(resolver.resolve(batch)).map((location) => {
		assert(location.kind === "sequence");
		return location.index;
	});
}

function expectUnavailable(
	result: TreeLocationResolution,
	reason: "target-deleted" | "invalid-location",
): void {
	assert.deepEqual(result, {
		status: "resolved",
		locations: [{ status: "unavailable", reason }],
	});
}

describe("TreeLocationResolver", () => {
	it("agrees with an independent gap model across randomized inserts, deletions, and moves", () => {
		for (let seed = 0; seed < 8; seed++) {
			const { views } = setup();
			const [sender, receiver] = views;
			const sourceArrays = [sender.root.left, sender.root.right];
			const arrays = [receiver.root.left, receiver.root.right];
			const expected: { array: number; index: number; affinity: "before" | "after" }[] = [];
			for (let array = 0; array < arrays.length; array++) {
				for (let index = 0; index <= arrays[array].length; index++) {
					for (const affinity of ["before", "after"] as const) {
						expected.push({ array, index, affinity });
					}
				}
			}
			const batch = capture(
				sender.locations,
				expected.map(({ array, index, affinity }) => ({
					kind: "sequence",
					node: sourceArrays[array],
					index,
					affinity,
				})),
			);
			const random = makeRandom(seed);
			for (let edit = 0; edit < 40; edit++) {
				const source = random.integer(0, 1);
				const operation = arrays[source].length === 0 ? 0 : random.integer(0, 2);
				if (operation === 0) {
					const at = random.integer(0, arrays[source].length);
					arrays[source].insertAt(at, "x");
					for (const gap of expected) {
						if (
							gap.array === source &&
							(gap.index > at || (gap.index === at && gap.affinity === "after"))
						) {
							gap.index++;
						}
					}
				} else {
					const start = random.integer(0, arrays[source].length - 1);
					const end = random.integer(start + 1, arrays[source].length);
					const target = 1 - source;
					const at = random.integer(0, arrays[target].length);
					if (operation === 1) {
						arrays[source].removeRange(start, end);
					} else {
						arrays[target].moveRangeToIndex(at, start, end, arrays[source]);
					}
					for (const gap of expected) {
						const follows =
							operation === 2 &&
							gap.array === source &&
							(gap.affinity === "after"
								? start <= gap.index && gap.index < end
								: start < gap.index && gap.index <= end);
						if (follows) {
							gap.array = target;
							gap.index = at + gap.index - start;
						} else if (gap.array === source && gap.index > start) {
							gap.index -= Math.min(gap.index, end) - start;
						} else if (
							operation === 2 &&
							gap.array === target &&
							(gap.index > at || (gap.index === at && gap.affinity === "after"))
						) {
							gap.index += end - start;
						}
					}
				}
				assert.deepEqual(
					resolved(receiver.locations.resolve(batch)),
					expected.map((gap) => ({
						kind: "sequence",
						node: arrays[gap.array],
						index: gap.index,
						affinity: gap.affinity,
					})),
					`seed ${seed}, edit ${edit}`,
				);
			}
		}
	});

	it("captures mixed node and gap locations and resolves to receiver SimpleTree objects", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = capture(sender.locations, [
			{ kind: "node", node: sender.root },
			{ kind: "node", node: sender.root.left },
			{ kind: "sequence", node: sender.root.left, index: 4, affinity: "after" },
			{ kind: "sequence", node: sender.root.left, index: 0, affinity: "before" },
		]);
		assert.equal(typeof batch.locations[0].node, "string");
		assert.equal(receiver.locations.capture([])?.revision, batch.revision);
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "node", node: receiver.root },
			{ kind: "node", node: receiver.root.left },
			{ kind: "sequence", node: receiver.root.left, index: 4, affinity: "after" },
			{ kind: "sequence", node: receiver.root.left, index: 0, affinity: "before" },
		]);
	});

	it("includes pending receiver edits with both affinities and deletion collapse", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const after = captureGaps(sender, [0, 1, 2, 3, 4]);
		const before = captureGaps(sender, [2], "before");
		receiver.root.left.insertAt(2, "i", "j");
		assert.equal(receiver.locations.capture([]), undefined);
		assert.deepEqual(indices(receiver.locations, after), [0, 1, 4, 5, 6]);
		assert.deepEqual(indices(receiver.locations, before), [2]);
		receiver.root.left.removeRange(0, 4);
		assert.deepEqual(indices(receiver.locations, after), [0, 0, 0, 1, 2]);
	});

	it("follows cross-array moves and chooses the adjacent side at boundaries", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const after = captureGaps(sender, [1, 2, 3]);
		const before = captureGaps(sender, [1, 2, 3], "before");
		receiver.root.right.moveRangeToIndex(1, 1, 3, receiver.root.left);
		assert.deepEqual(resolved(receiver.locations.resolve(after)), [
			{ kind: "sequence", node: receiver.root.right, index: 1, affinity: "after" },
			{ kind: "sequence", node: receiver.root.right, index: 2, affinity: "after" },
			{ kind: "sequence", node: receiver.root.left, index: 1, affinity: "after" },
		]);
		assert.deepEqual(resolved(receiver.locations.resolve(before)), [
			{ kind: "sequence", node: receiver.root.left, index: 1, affinity: "before" },
			{ kind: "sequence", node: receiver.root.right, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.right, index: 3, affinity: "before" },
		]);
	});

	for (const transaction of [false, true]) {
		it(`follows characters out of a deleted source array${transaction ? " in a transaction" : ""}`, () => {
			const { views } = setup();
			const [sender, receiver] = views;
			const gap = captureGaps(sender, [2]);
			const node = capture(sender.locations, [{ kind: "node", node: sender.root.left }]);
			const edit = (): void => {
				receiver.root.right.moveRangeToIndex(1, 0, 4, receiver.root.left);
				receiver.root.left = new Text(["replacement"]);
			};
			if (transaction) {
				receiver.runTransaction(edit);
			} else {
				edit();
			}
			assert.deepEqual(resolved(receiver.locations.resolve(gap)), [
				{ kind: "sequence", node: receiver.root.right, index: 3, affinity: "after" },
			]);
			expectUnavailable(receiver.locations.resolve(node), "target-deleted");
		});
	}

	it("follows text moved into an array created in the same transaction", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = captureGaps(sender, [2]);
		receiver.runTransaction(() => {
			receiver.root.right = new Text([]);
			receiver.root.right.moveRangeToIndex(0, 1, 3, receiver.root.left);
		});
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "sequence", node: receiver.root.right, index: 1, affinity: "after" },
		]);
	});

	it("follows whole objects and arrays across fields without changing their identity", () => {
		class Item extends sf.object("Item", { text: Text }) {}
		class Items extends sf.array("Items", Item) {}
		class Root extends sf.object("Root", { a: Items, b: Items }) {}
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) =>
			tree.kernel.viewWith(new TreeViewConfiguration({ schema: Root })),
		);
		views[0].initialize({ a: [{ text: ["a", "b"] }], b: [] });
		provider.synchronizeMessages();
		const [sender, receiver] = views;
		const item = sender.root.a[0];
		const batch = capture(sender.locations, [
			{ kind: "node", node: item },
			{ kind: "node", node: item.text },
			{ kind: "sequence", node: item.text, index: 1, affinity: "after" },
		]);
		receiver.root.b.moveToStart(0, receiver.root.a);
		receiver.root.b[0].text.insertAtStart("x");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "node", node: receiver.root.b[0] },
			{ kind: "node", node: receiver.root.b[0].text },
			{ kind: "sequence", node: receiver.root.b[0].text, index: 2, affinity: "after" },
		]);
	});

	it("uses stored field keys and handles empty arrays and multi-code-unit elements", () => {
		class Root extends sf.object("StoredKeys", {
			text: sf.required(Text, { key: "stored" }),
		}) {}
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) =>
			tree.kernel.viewWith(new TreeViewConfiguration({ schema: Root })),
		);
		views[0].initialize({ text: [] });
		provider.synchronizeMessages();
		const batch = capture(views[0].locations, [
			{ kind: "sequence", node: views[0].root.text, index: 0, affinity: "before" },
			{ kind: "sequence", node: views[0].root.text, index: 0, affinity: "after" },
		]);
		views[1].root.text.insertAtStart("\u{1F600}", "a");
		assert.deepEqual(indices(views[1].locations, batch), [0, 2]);
	});

	it("uses the current rebased local suffix, not transient rollback operations", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const batch = captureGaps(sender, [2, 4]);
		sender.root.left.insertAtStart("remote");
		receiver.root.left.insertAtEnd("local");
		do {
			provider.synchronizeMessages({ count: 1 });
		} while (sender.locations.capture([]) === undefined);
		assert.equal(receiver.locations.capture([]), undefined);
		assert.deepEqual(indices(receiver.locations, batch), [3, 6]);
		provider.synchronizeMessages();
		assert.equal(
			receiver.locations.capture([])?.revision,
			sender.locations.capture([])?.revision,
		);
	});

	it("retries a future revision after receiving its operations", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const runtime = provider.trees[1].containerRuntime;
		runtime.connected = false;
		sender.root.left.insertAtEnd("new");
		provider.synchronizeMessages();
		const batch = captureGaps(sender, [5]);
		assert.deepEqual(receiver.locations.resolve(batch), { status: "revision-unavailable" });
		runtime.connected = true;
		provider.synchronizeMessages();
		assert.deepEqual(indices(receiver.locations, batch), [5]);
	});

	it("expires old revisions without retaining history for captured locations", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const old = captureGaps(sender, [2]);
		for (let i = 0; i < 8; i++) {
			sender.root.left.insertAtStart("s");
			receiver.root.right.insertAtStart("r");
			provider.synchronizeMessages();
		}
		assert.deepEqual(receiver.locations.resolve(old), { status: "revision-unavailable" });
		assert.deepEqual(indices(receiver.locations, captureGaps(sender, [0, 12])), [0, 12]);
	});

	it("validates local capture inputs and foreign view objects", () => {
		const { views } = setup();
		for (const index of [-1, 5, 1.5, Number.NaN, Infinity]) {
			assert.throws(
				() =>
					views[0].locations.capture([
						{ kind: "sequence", node: views[0].root.left, index, affinity: "after" },
					]),
				/in-bounds gap/,
			);
		}
		assert.throws(
			() => views[0].locations.capture([{ kind: "node", node: views[1].root }]),
			/must belong/,
		);
		assert.throws(
			() => views[0].locations.capture([{ kind: "node", node: new Text([]) }]),
			/must belong/,
		);
	});

	it("validates wire references, gaps, and revision pairing", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = captureGaps(sender, [2]);
		const location = batch.locations[0];
		assert(location.kind === "sequence");
		for (const reference of [
			"not json",
			"null",
			"{}",
			'{"version":999}',
			'{"version":1,"path":[]}',
		]) {
			expectUnavailable(
				receiver.locations.resolve({
					...batch,
					locations: [{ ...location, node: reference as TreeNodeReference }],
				}),
				"invalid-location",
			);
		}
		for (const index of [-1, 5, 1.5, Number.NaN, Infinity]) {
			expectUnavailable(
				receiver.locations.resolve({
					...batch,
					locations: [{ ...location, index }],
				}),
				"invalid-location",
			);
		}
		assert.deepEqual(
			receiver.locations.resolve({ ...batch, revision: "wrong" as TreePositionRevision }),
			{ status: "revision-unavailable" },
		);
	});

	it("does not publish during transactions or from forks and does not retain aborted edits", () => {
		const { views } = setup();
		const view = views[0];
		const batch = captureGaps(view, [0, 2, 4]);
		view.runTransaction(() => {
			assert.equal(view.locations.capture([]), undefined);
			assert.throws(() => view.locations.resolve(batch), /during a transaction/);
			view.root.left.removeRange();
			return { rollback: true };
		});
		assert.equal(view.locations.capture([])?.revision, batch.revision);
		assert.deepEqual(indices(view.locations, batch), [0, 2, 4]);
		const fork = view.fork();
		assert.equal(fork.locations.capture([]), undefined);
		fork.dispose();
	});

	it("preserves deletion collapse across undo without reviving node selections", () => {
		const { views } = setup();
		const view = views[0];
		const before = captureGaps(view, [2], "before");
		const after = captureGaps(view, [2]);
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
		assert.deepEqual(indices(view.locations, before), [1]);
		assert.deepEqual(indices(view.locations, after), [3]);
	});

	it("does not revive whole-node selections after deletion and undo", () => {
		const { views } = setup();
		const view = views[0];
		const batch = capture(view.locations, [{ kind: "node", node: view.root.left }]);
		let undo: RevertibleAlpha | undefined;
		const off = view.events.on("changed", (metadata) => {
			if (metadata.isLocal) {
				undo = metadata.getRevertible();
			}
		});
		view.root.left = new Text(["replacement"]);
		off();
		assert(undo !== undefined);
		undo.revert();
		expectUnavailable(view.locations.resolve(batch), "target-deleted");
	});

	it("resolves across restoration of content removed before the captured revision", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		let undo: RevertibleAlpha | undefined;
		const off = sender.events.on("changed", (metadata) => {
			if (metadata.isLocal) {
				undo = metadata.getRevertible();
			}
		});
		sender.root.left.removeRange(1, 3);
		off();
		assert(undo !== undefined);
		provider.synchronizeMessages();
		const before = captureGaps(sender, [1], "before");
		const after = captureGaps(sender, [1], "after");
		undo.revert();
		provider.synchronizeMessages();
		assert.deepEqual(indices(receiver.locations, before), [1]);
		assert.deepEqual(indices(receiver.locations, after), [3]);
	});

	it("captures map nodes and returns schema-narrowable SimpleTree objects", () => {
		class Metadata extends sf.map("Metadata", sf.string) {}
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) =>
			tree.kernel.viewWith(new TreeViewConfiguration({ schema: Metadata })),
		);
		views[0].initialize(new Map([["title", "one"]]));
		provider.synchronizeMessages();
		const batch = capture(views[0].locations, [{ kind: "node", node: views[0].root }]);
		views[1].root.set("title", "two");
		const [location] = resolved(views[1].locations.resolve(batch));
		assert(location.kind === "node");
		assert(location.node instanceof Metadata);
		assert.equal(location.node.get("title"), "two");
		assert.equal(location.node, views[1].root);
	});

	it("rejects mixing a reference with a different retained revision", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const batch = captureGaps(sender, [1]);
		sender.root.right.insertAtStart("x");
		provider.synchronizeMessages();
		const newer = sender.locations.capture([]);
		assert(newer !== undefined);
		expectUnavailable(
			receiver.locations.resolve({ ...batch, revision: newer.revision }),
			"invalid-location",
		);
	});

	it("resolves node and gap locations across schema widening and subsequent edits", () => {
		const { provider, views } = setup();
		const batch = capture(views[0].locations, [
			{ kind: "node", node: views[0].root },
			{ kind: "node", node: views[0].root.left },
			{ kind: "sequence", node: views[0].root.left, index: 1, affinity: "after" },
		]);
		views[0].dispose();
		const upgraded = new SchemaFactory("com.example.locations");
		class Updated extends upgraded.object("Document", {
			left: Text,
			right: Text,
			title: upgraded.optional(upgraded.string),
		}) {}
		const view = provider.trees[0].kernel.viewWith(
			new TreeViewConfiguration({ schema: Updated }),
		);
		view.upgradeSchema();
		assert.deepEqual(resolved(view.locations.resolve(batch)), [
			{ kind: "node", node: view.root },
			{ kind: "node", node: view.root.left },
			{ kind: "sequence", node: view.root.left, index: 1, affinity: "after" },
		]);
		view.root.left.insertAtStart("x");
		view.root.right.moveRangeToIndex(1, 1, 4, view.root.left);
		assert.deepEqual(resolved(view.locations.resolve(batch)), [
			{ kind: "node", node: view.root },
			{ kind: "node", node: view.root.left },
			{ kind: "sequence", node: view.root.right, index: 2, affinity: "after" },
		]);
	});

	it("replays data entries interleaved with schema changes in the same commit", () => {
		const { provider, views } = setup();
		const batch = capture(views[0].locations, [
			{ kind: "node", node: views[0].root.left },
			{ kind: "sequence", node: views[0].root.left, index: 2, affinity: "after" },
		]);
		const checkout = provider.trees[0].kernel.checkout;
		checkout.transaction.start();
		views[0].root.left.insertAtStart("x");
		views[0].dispose();
		const upgraded = new SchemaFactory("com.example.locations");
		class Updated extends upgraded.object("Document", {
			left: Text,
			right: Text,
			title: upgraded.optional(upgraded.string),
		}) {}
		const updatedConfig = new TreeViewConfiguration({ schema: Updated });
		const view = provider.trees[0].kernel.viewWith(updatedConfig);
		view.upgradeSchema();
		view.root.right.moveRangeToIndex(1, 1, 4, view.root.left);
		checkout.transaction.commit();
		assert.deepEqual(
			checkout.getLocationHead().change.changes.map((change) => change.type),
			["data", "schema", "data"],
		);
		assert.deepEqual(resolved(view.locations.resolve(batch)), [
			{ kind: "node", node: view.root.left },
			{ kind: "sequence", node: view.root.right, index: 3, affinity: "after" },
		]);
		views[1].dispose();
		const receiver = provider.trees[1].kernel.viewWith(updatedConfig);
		provider.synchronizeMessages();
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "node", node: receiver.root.left },
			{ kind: "sequence", node: receiver.root.right, index: 3, affinity: "after" },
		]);
	});

	it("reports normal view incompatibility instead of rejecting historical schema changes", () => {
		const { provider, views } = setup();
		const batch = captureGaps(views[0], [1]);
		const receiver = views[1].locations;
		views[0].dispose();
		const upgraded = new SchemaFactory("com.example.locations");
		class Updated extends upgraded.object("Document", {
			left: Text,
			right: Text,
			title: upgraded.optional(upgraded.string),
		}) {}
		const view = provider.trees[0].kernel.viewWith(
			new TreeViewConfiguration({ schema: Updated }),
		);
		view.upgradeSchema();
		provider.synchronizeMessages();
		assert.equal(views[1].compatibility.canView, false);
		assert.throws(() => receiver.resolve(batch), /view schema is incompatible/);
	});

	it("rejects retained resolver references after view disposal", () => {
		const { views } = setup();
		const resolver = views[0].locations;
		const batch = captureGaps(views[0], [0]);
		views[0].dispose();
		assert.throws(() => resolver.capture([]), /disposed TreeView/);
		assert.throws(() => resolver.resolve(batch), /disposed TreeView/);
	});

	it("scopes captures to acknowledged shared branches", () => {
		const provider = new TestTreeProviderLite(
			2,
			configuredSharedTree({ enableSharedBranches: true }).getFactory(),
		);
		const main = provider.trees[0].kernel.viewWith(config);
		main.initialize({ left: ["a", "b"], right: [] });
		provider.synchronizeMessages();
		const mainCapture = captureGaps(main, [1]);
		const branch = provider.trees[0].createSharedBranch();
		const first = asAlpha(provider.trees[0].viewSharedBranchWith(branch, config));
		assert.equal(first.locations.capture([]), undefined);
		provider.synchronizeMessages();
		const second = asAlpha(provider.trees[1].viewSharedBranchWith(branch, config));
		const batch = captureGaps(first, [1]);
		assert.notEqual(batch.revision, mainCapture.revision);
		assert.deepEqual(second.locations.resolve(mainCapture), {
			status: "revision-unavailable",
		});
		second.root.left.insertAtStart("x");
		assert.deepEqual(indices(second.locations, batch), [2]);
		assert.deepEqual(main.locations.resolve(batch), { status: "revision-unavailable" });
	});
});
