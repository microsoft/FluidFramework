/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { AttachState } from "@fluidframework/container-definitions";
import {
	MockFluidDataStoreRuntime,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../../api.js";
import type { RevertibleAlpha } from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { CapturedTreeLocationsInternal } from "../../../shared-tree/locations.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type CapturedTreeLocations,
	type TreeLocation,
	type TreeLocationResolver,
	type TreeLocationResolution,
	type ResolvedTreeLocation,
	type TreeViewAlpha,
} from "../../../simple-tree/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import type { requireFalse } from "../../../util/index.js";
import { getView, TestTreeProviderLite } from "../../utils.js";

const sf = new SchemaFactory("com.example.locations");
class Text extends sf.array("Text", sf.string) {}
class Document extends sf.object("Document", { left: Text, right: Text }) {}
const config = new TreeViewConfiguration({ schema: Document });

type _CaptureHidesRevision = requireFalse<
	"revision" extends keyof CapturedTreeLocations ? true : false
>;
type _CaptureHidesLocations = requireFalse<
	"locations" extends keyof CapturedTreeLocations ? true : false
>;
type _CaptureCannotBeConstructed = requireFalse<
	{ revision: string; locations: [] } extends CapturedTreeLocations ? true : false
>;

function capturedData(captured: CapturedTreeLocations): CapturedTreeLocationsInternal {
	return captured as unknown as CapturedTreeLocationsInternal;
}

function eraseCapture(data: CapturedTreeLocationsInternal): CapturedTreeLocations {
	return data as unknown as CapturedTreeLocations;
}

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

function resolved(
	result: TreeLocationResolution,
): readonly Extract<ResolvedTreeLocation, { status: "resolved" }>["location"][] {
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
	it("materializes unread receiver nodes and reuses their cached SimpleTree objects", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = capture(sender.locations, [
			{ kind: "node", node: sender.root.left },
			{ kind: "sequence", node: sender.root.left, index: 1 },
		]);
		const first = resolved(receiver.locations.resolve(batch));
		const second = resolved(receiver.locations.resolve(batch));
		assert.equal(first[0].node, first[1].node);
		assert.equal(second[0].node, first[0].node);
		assert.equal(second[1].node, first[0].node);
		assert.equal(first[0].node, receiver.root.left);
	});

	it("defaults omitted and undefined affinity to before across JSON transport", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = capture(sender.locations, [
			{ kind: "sequence", node: sender.root.left, index: 2 },
			{ kind: "sequence", node: sender.root.left, index: 2, affinity: undefined },
			{ kind: "sequence", node: sender.root.left, index: 2, affinity: "before" },
			{ kind: "sequence", node: sender.root.left, index: 2, affinity: "after" },
		]);
		receiver.root.left.insertAt(2, "x");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "sequence", node: receiver.root.left, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.left, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.left, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.left, index: 3, affinity: "after" },
		]);
	});

	it("uses before affinity by default at cross-array move boundaries", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = capture(sender.locations, [
			{ kind: "sequence", node: sender.root.left, index: 1 },
			{ kind: "sequence", node: sender.root.left, index: 3 },
		]);
		receiver.root.right.moveRangeToIndex(1, 1, 3, receiver.root.left);
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "sequence", node: receiver.root.left, index: 1, affinity: "before" },
			{ kind: "sequence", node: receiver.root.right, index: 3, affinity: "before" },
		]);
	});

	it("does not replace invalid affinities with the default", () => {
		const { views } = setup();
		for (const affinity of ["invalid", null, 0]) {
			const location: TreeLocation = {
				kind: "sequence",
				node: views[0].root.left,
				index: 0,
				affinity: affinity as "before",
			};
			assert.throws(
				() => views[0].locations.capture([location]),
				validateUsageError(/affinity/),
			);
		}
	});

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
		assert.equal(typeof capturedData(batch).locations[0].node, "string");
		assert.equal(
			capturedData(receiver.locations.capture([])).revision,
			capturedData(batch).revision,
		);
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
		assert.throws(
			() => receiver.locations.capture([]),
			validateUsageError(/pending local edits/),
		);
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
		} while (
			provider.trees[0].kernel.getLocalBranch().getHead() !==
			provider.trees[0].kernel.getTrunkHead()
		);
		assert.throws(
			() => receiver.locations.capture([]),
			validateUsageError(/pending local edits/),
		);
		assert.deepEqual(indices(receiver.locations, batch), [3, 6]);
		provider.synchronizeMessages();
		assert.equal(
			capturedData(receiver.locations.capture([])).revision,
			capturedData(sender.locations.capture([])).revision,
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
		const data = capturedData(batch);
		const location = data.locations[0];
		assert(location.kind === "sequence");
		for (const reference of [
			"not json",
			"null",
			"{}",
			'{"version":999}',
			'{"version":1,"path":[]}',
		]) {
			expectUnavailable(
				receiver.locations.resolve(
					eraseCapture({
						...data,
						locations: [{ ...location, node: reference }],
					}),
				),
				"invalid-location",
			);
		}
		for (const index of [-1, 5, 1.5, Number.NaN, Infinity]) {
			expectUnavailable(
				receiver.locations.resolve(
					eraseCapture({
						...data,
						locations: [{ ...location, index }],
					}),
				),
				"invalid-location",
			);
		}
		assert.deepEqual(
			receiver.locations.resolve(eraseCapture({ ...data, revision: "wrong" })),
			{ status: "revision-unavailable" },
		);
	});

	it("rejects open transactions and does not retain aborted edits", () => {
		const { views } = setup();
		const view = views[0];
		const batch = captureGaps(view, [0, 2, 4]);
		view.runTransaction(() => {
			assert.throws(
				() => view.locations.capture([]),
				validateUsageError(/during a transaction/),
			);
			assert.throws(
				() => view.locations.resolve(batch),
				validateUsageError(/during a transaction/),
			);
			view.root.left.removeRange();
			assert.throws(
				() => view.locations.capture([]),
				validateUsageError(/during a transaction/),
			);
			return { rollback: true };
		});
		assert.equal(
			capturedData(view.locations.capture([])).revision,
			capturedData(batch).revision,
		);
		assert.deepEqual(indices(view.locations, batch), [0, 2, 4]);
		const fork = view.fork();
		assert.throws(
			() => fork.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => fork.locations.resolve(batch),
			validateUsageError(/only supported on the main view/),
		);
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
		expectUnavailable(
			receiver.locations.resolve(
				eraseCapture({ ...capturedData(batch), revision: capturedData(newer).revision }),
			),
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

	it("rejects non-main shared branches before and after acknowledgement", () => {
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
		assert.throws(
			() => first.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => first.locations.resolve(mainCapture),
			validateUsageError(/only supported on the main view/),
		);
		provider.synchronizeMessages();
		const second = asAlpha(provider.trees[1].viewSharedBranchWith(branch, config));
		assert.throws(
			() => first.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => first.locations.resolve(mainCapture),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => second.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => second.locations.resolve(mainCapture),
			validateUsageError(/only supported on the main view/),
		);
		second.root.left.insertAtStart("x");
		provider.synchronizeMessages();
		assert.throws(
			() => second.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.deepEqual(indices(main.locations, mainCapture), [1]);
	});

	it("rejects pending edits and permits capture once they are acknowledged", () => {
		const { provider, views } = setup();
		const view = views[0];
		view.root.left.insertAtStart("x");
		assert.throws(() => captureGaps(view, [1]), validateUsageError(/pending local edits/));
		provider.synchronizeMessages();
		assert.deepEqual(indices(views[1].locations, captureGaps(view, [1])), [1]);
	});

	it("rejects capture before initialization has a sequenced revision", () => {
		const provider = new TestTreeProviderLite();
		const view = provider.trees[0].kernel.viewWith(config);
		assert.throws(
			() => view.locations.capture([]),
			validateUsageError(/before the main view has a sequenced revision/),
		);
		view.initialize({ left: [], right: [] });
		assert.throws(() => view.locations.capture([]), validateUsageError(/pending local edits/));
		provider.synchronizeMessages();
		assert.deepEqual(resolved(view.locations.resolve(captureGaps(view, [0]))).length, 1);
	});

	it("rejects detached and independent views", () => {
		const { views } = setup();
		const batch = captureGaps(views[0], [1]);
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
		const tree = configuredSharedTree({}).getFactory().create(runtime, "tree");
		const detached = asAlpha(tree.viewWith(config));
		detached.initialize({ left: ["a"], right: [] });
		assert.throws(
			() => detached.locations.capture([]),
			validateUsageError(/require an attached SharedTree/),
		);
		assert.throws(
			() => detached.locations.resolve(batch),
			validateUsageError(/require an attached SharedTree/),
		);
		const independent = getView(config);
		independent.initialize({ left: ["a"], right: [] });
		assert.throws(
			() => independent.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => independent.locations.resolve(batch),
			validateUsageError(/only supported on the main view/),
		);
	});
});
