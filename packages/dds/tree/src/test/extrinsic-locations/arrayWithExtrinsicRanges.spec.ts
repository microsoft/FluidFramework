/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { asAlpha } from "../../api.js";
import { ArrayWithExtrinsicRanges } from "../../extrinsic-locations/index.js";
import { FluidClientVersion } from "../../codec/index.js";
import { TreeBeta } from "../../shared-tree/index.js";
import {
	allowUnused,
	SchemaFactory,
	SchemaFactoryBeta,
	TreeArrayNode,
	TreeViewConfiguration,
	type NodeFromSchema,
	type ReadonlyArrayNode,
	type TreeViewAlpha,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import { describeHydration, hydrateNode } from "../simple-tree/index.js";
import { testSchemaCompatibilitySnapshots } from "../snapshots/index.js";
import { createTestUndoRedoStacks, getView, TestTreeProviderLite } from "../utils.js";

const sf = new SchemaFactoryBeta("test.extrinsicRanges");
class ArrayWithRanges extends ArrayWithExtrinsicRanges.createSchema(
	sf,
	SchemaFactory.string,
	SchemaFactory.number,
) {}
const config = new TreeViewConfiguration({
	schema: ArrayWithRanges,
	enableSchemaValidation: true,
});

function endpoints(
	array: ArrayWithRanges,
	range: ArrayWithExtrinsicRanges.Range<typeof SchemaFactory.string>,
): [number, number] {
	const { start, end } = array.getExtrinsicRange(range);
	return [start, end];
}

describe("ArrayWithExtrinsicRanges", () => {
	describeHydration("content and ranges", (_init, hydrated) => {
		function create(content: number[] = [0, 1, 2, 3, 4]): ArrayWithRanges {
			const array = ArrayWithRanges.create(content);
			if (hydrated) {
				hydrateNode(array);
			}
			return array;
		}

		it("@Smoke maintains ranges through insertion and removal", () => {
			const array = create();
			const range = array.addExtrinsicRange(1, 4, "comment");
			array.transactOnContent((content) => content.insertAt(0, 10, 11));
			assert.deepEqual([...array.content], [10, 11, 0, 1, 2, 3, 4]);
			assert.deepEqual([...endpoints(array, range), range.data], [3, 6, "comment"]);
			assert.equal(array.ranges[0], range);
			array.transactOnContent((content) => content.removeRange(2, 5));
			assert.deepEqual([...array.content], [10, 11, 3, 4]);
			assert.deepEqual(endpoints(array, range), [2, 3]);
			array.transactOnContent((content) => content.removeRange());
			assert.deepEqual(endpoints(array, range), [0, 0]);
			assert.equal(array.ranges[0], range);
		});

		for (const [index, expected] of [
			[0, [2, 4]],
			[1, [2, 4]],
			[2, [1, 4]],
			[3, [1, 4]],
			[4, [1, 3]],
			[5, [1, 3]],
		] as const) {
			it(`inserts at ${index} with insertion-point endpoint semantics`, () => {
				const array = create();
				const range = array.addExtrinsicRange(1, 3, "range");
				array.transactOnContent((content) => content.insertAt(index, 9));
				assert.deepEqual(endpoints(array, range), expected);
			});
		}

		for (const [start, end, expected] of [
			[0, 1, [0, 2]],
			[0, 2, [0, 1]],
			[0, 4, [0, 0]],
			[1, 2, [1, 2]],
			[2, 3, [1, 2]],
			[2, 4, [1, 2]],
			[3, 5, [1, 3]],
			[0, 5, [0, 0]],
		] as const) {
			it(`removes [${start}, ${end}) without deleting ranges`, () => {
				const array = create();
				const range = array.addExtrinsicRange(1, 3, "range");
				array.transactOnContent((content) => content.removeRange(start, end));
				assert.deepEqual(endpoints(array, range), expected);
				assert.equal(array.ranges[0], range);
			});
		}

		it("supports empty content, empty ranges, and no-op edits", () => {
			const array = create([]);
			const range = array.addExtrinsicRange(0, 0, "empty");
			array.transactOnContent((content) => {
				content.insertAt(0);
				content.removeRange();
			});
			assert.deepEqual(endpoints(array, range), [0, 0]);
			array.transactOnContent((content) => content.insertAt(0, 7));
			assert.deepEqual(endpoints(array, range), [1, 1]);
			array.transactOnContent((content) => content.removeRange(1, 1));
			assert.deepEqual(endpoints(array, range), [1, 1]);
			array.transactOnContent((content) => content.removeRange(0));
			assert.deepEqual(endpoints(array, range), [0, 0]);
		});

		it("updates overlapping ranges independently", () => {
			const array = create();
			const outer = array.addExtrinsicRange(0, 5, "outer");
			const inner = array.addExtrinsicRange(1, 3, "inner");
			const empty = array.addExtrinsicRange(2, 2, "empty");
			array.transactOnContent((content) => content.insertAt(2, TreeArrayNode.spread([8, 9])));
			assert.deepEqual(
				array.ranges.map((range) => endpoints(array, range)),
				[
					[0, 7],
					[1, 5],
					[4, 4],
				],
			);
			array.transactOnContent((content) => content.removeRange(1, 6));
			assert.deepEqual(
				[outer, inner, empty].map((range) => endpoints(array, range)),
				[
					[0, 2],
					[1, 1],
					[1, 1],
				],
			);
		});

		it("sets and removes ranges by identity", () => {
			const array = create();
			const first = array.addExtrinsicRange(1, 3, "same");
			const second = array.addExtrinsicRange(1, 3, "same");
			array.setExtrinsicRange(first, 0, 5);
			assert.deepEqual(endpoints(array, first), [0, 5]);
			assert.deepEqual(endpoints(array, second), [1, 3]);
			array.removeExtrinsicRange(first);
			assert.deepEqual([...array.ranges], [second]);
			assert.deepEqual([...array.content], [0, 1, 2, 3, 4]);
			assert.throws(
				() => array.removeExtrinsicRange(first),
				validateUsageError(/does not belong/),
			);
			assert.throws(
				() => array.setExtrinsicRange(first, 0, 0),
				validateUsageError(/does not belong/),
			);
			assert.throws(
				() => array.getExtrinsicRange(first),
				validateUsageError(/does not belong/),
			);
		});

		it("rejects foreign and fabricated ranges", () => {
			const array = create();
			const other = create();
			for (const range of [
				other.addExtrinsicRange(0, 1, "other"),
				{ start: 0, end: 1, data: "fabricated" },
			]) {
				assert.throws(
					() => array.removeExtrinsicRange(range),
					validateUsageError(/does not belong/),
				);
				assert.throws(
					() => array.setExtrinsicRange(range, 0, 1),
					validateUsageError(/does not belong/),
				);
				assert.throws(
					() => array.getExtrinsicRange(range),
					validateUsageError(/does not belong/),
				);
			}
		});

		it("rejects invalid endpoints before changing content or ranges", () => {
			const array = create();
			const range = array.addExtrinsicRange(1, 3, "range");
			for (const [start, end] of [
				[-1, 1],
				[0, 6],
				[3, 2],
				[0.5, 1],
				[0, Number.NaN],
				[0, Infinity],
			]) {
				assert.throws(() => array.addExtrinsicRange(start, end, "invalid"), UsageError);
				assert.throws(() => array.setExtrinsicRange(range, start, end), UsageError);
			}
			assert.deepEqual([...array.content], [0, 1, 2, 3, 4]);
			assert.deepEqual(endpoints(array, range), [1, 3]);
			assert.equal(array.ranges.length, 1);
		});

		it("delivers content events during the callback without buffering invalidation", () => {
			const array = create();
			const range = array.addExtrinsicRange(1, 4, "range");
			let events = 0;
			let cached = [...array.content];
			const off = TreeBeta.on(array.content, "nodeChanged", () => {
				events++;
				cached = [...array.content];
			});
			array.transactOnContent((content) => {
				content.insertAtStart(9);
				assert.equal(events, 1);
				assert.deepEqual(cached, [9, 0, 1, 2, 3, 4]);
				assert.deepEqual(endpoints(array, range), [2, 5]);
				content.removeAt(0);
				assert.equal(events, 2);
				assert.deepEqual(cached, [0, 1, 2, 3, 4]);
				assert.deepEqual(endpoints(array, range), [1, 4]);
			});
			off();
		});

		it("returns current endpoint snapshots and persists them after the callback", () => {
			const array = create();
			const range = array.addExtrinsicRange(1, 4, "range");
			const original = array.getExtrinsicRange(range);
			array.transactOnContent((content) => {
				assert.equal(content, array.content);
				content.insertAtStart(9);
				assert.deepEqual(array.getExtrinsicRange(range), { start: 2, end: 5 });
				assert.equal(
					JSON.stringify(range),
					JSON.stringify({ data: "range", start: 1, end: 4 }),
				);
				content.removeRange(2, 4);
				assert.deepEqual(array.getExtrinsicRange(range), { start: 2, end: 3 });
			});
			assert.deepEqual(original, { start: 1, end: 4 });
			assert.deepEqual(array.getExtrinsicRange(range), { start: 2, end: 3 });
			assert.equal(JSON.stringify(range), JSON.stringify({ data: "range", start: 2, end: 3 }));
		});

		it("adds, repositions, and removes ranges in current coordinates during a callback", () => {
			const array = create();
			const kept = array.addExtrinsicRange(1, 4, "kept");
			const removed = array.addExtrinsicRange(0, 5, "removed");
			array.transactOnContent((content) => {
				content.insertAtStart(9);
				const added = array.addExtrinsicRange(0, 2, "added");
				array.setExtrinsicRange(kept, 2, 5);
				array.removeExtrinsicRange(removed);
				content.insertAt(1, 8);
				assert.deepEqual(endpoints(array, kept), [3, 6]);
				assert.deepEqual(endpoints(array, added), [0, 3]);
				assert.throws(
					() => array.getExtrinsicRange(removed),
					validateUsageError(/does not belong/),
				);
			});
			assert.deepEqual(
				array.ranges.map((range) => [...endpoints(array, range), range.data]),
				[
					[3, 6, "kept"],
					[0, 3, "added"],
				],
			);
		});

		it("uses anchors for position reads during endpoint writeback", () => {
			const array = create();
			const range = array.addExtrinsicRange(1, 4, "range");
			const observed: [number, number][] = [];
			const off = TreeBeta.on(array, "treeChanged", () => {
				observed.push(endpoints(array, range));
			});
			array.transactOnContent((content) => content.insertAtStart(9));
			off();
			assert(observed.length > 0);
			assert(observed.every(([start, end]) => start === 2 && end === 5));
		});

		for (const event of ["nodeChanged", "treeChanged"] as const) {
			it(`resolves positions from ${event} callbacks registered inside the editing scope`, () => {
				const array = create();
				const range = array.addExtrinsicRange(1, 4, "range");
				const observed: [number, number][] = [];
				array.transactOnContent((content) => {
					const off = TreeBeta.on(content, event, () => {
						observed.push(endpoints(array, range));
					});
					content.insertAtStart(9);
					content.removeAt(0);
					off();
				});
				assert.deepEqual(observed, [
					[2, 5],
					[1, 4],
				]);
			});

			// TODO: Anchor updates run after previously registered listeners.
			// Enable this regression test when the independent anchor event-ordering bug is fixed.
			it.skip(`resolves positions from ${event} callbacks registered before the editing scope`, () => {
				const array = create();
				const range = array.addExtrinsicRange(1, 4, "range");
				const observed: [number, number][] = [];
				const off = TreeBeta.on(array.content, event, () => {
					observed.push(endpoints(array, range));
				});
				array.transactOnContent((content) => {
					content.insertAtStart(9);
					content.removeAt(0);
				});
				off();
				assert.deepEqual(observed, [
					[2, 5],
					[1, 4],
				]);
			});
		}

		it("rejects same-manager nesting without ending the outer editing scope", () => {
			const array = create();
			const range = array.addExtrinsicRange(1, 4, "range");
			array.transactOnContent((content) => {
				assert.throws(
					() => array.transactOnContent(() => {}),
					validateUsageError(/Cannot nest/),
				);
				content.insertAtStart(9);
				assert.deepEqual(endpoints(array, range), [2, 5]);
			});
			array.transactOnContent((content) => content.removeAt(0));
			assert.deepEqual(endpoints(array, range), [1, 4]);
		});

		it("tracks moves within the content array", () => {
			const array = create();
			const range = array.addExtrinsicRange(1, 3, "range");
			array.transactOnContent((content) => {
				content.moveToIndex(0, 4);
				assert.deepEqual(endpoints(array, range), [2, 4]);
				content.moveRangeToEnd(0, 2);
				assert.deepEqual(endpoints(array, range), [0, 2]);
			});
			assert.deepEqual([...array.content], [1, 2, 3, 4, 0]);
			assert.deepEqual(endpoints(array, range), [0, 2]);
		});

		it("tracks both arrays when moving content between nested editing scopes", () => {
			class Root extends sf.object("MoveRoot", {
				source: ArrayWithRanges,
				destination: ArrayWithRanges,
			}) {}
			const root = new Root({
				source: ArrayWithRanges.create([0, 1, 2]),
				destination: ArrayWithRanges.create([3, 4]),
			});
			if (hydrated) {
				hydrateNode(root);
			}
			const sourceRange = root.source.addExtrinsicRange(1, 3, "source");
			const destinationRange = root.destination.addExtrinsicRange(0, 2, "destination");
			root.source.transactOnContent((source) => {
				root.destination.transactOnContent((destination) => {
					destination.moveRangeToIndex(1, 1, 3, source);
					assert.deepEqual(endpoints(root.source, sourceRange), [1, 1]);
					assert.deepEqual(endpoints(root.destination, destinationRange), [0, 4]);
				});
			});
			assert.deepEqual([...root.source.content], [0]);
			assert.deepEqual([...root.destination.content], [3, 1, 2, 4]);
			assert.deepEqual(endpoints(root.source, sourceRange), [1, 1]);
			assert.deepEqual(endpoints(root.destination, destinationRange), [0, 4]);
		});
	});

	it("keeps partial unhydrated edits consistent after a thrown callback and releases the scope", () => {
		const array = ArrayWithRanges.create([0, 1, 2]);
		const range = array.addExtrinsicRange(1, 3, "range");
		const error = new Error("callback failed");
		assert.throws(
			() =>
				array.transactOnContent((content) => {
					content.insertAtStart(9);
					throw error;
				}),
			(actual) => actual === error,
		);
		assert.deepEqual([...array.content], [9, 0, 1, 2]);
		assert.deepEqual(endpoints(array, range), [2, 4]);
		array.transactOnContent((content) => content.removeAt(0));
		assert.deepEqual(endpoints(array, range), [1, 3]);
	});

	it("rejects promise-returning callbacks and releases the unhydrated editing scope", () => {
		const array = ArrayWithRanges.create([0, 1, 2]);
		const range = array.addExtrinsicRange(1, 3, "range");
		assert.throws(
			() =>
				// eslint-disable-next-line @typescript-eslint/no-misused-promises -- Verifies rejection of asynchronous callbacks.
				array.transactOnContent(async () => {
					await Promise.resolve();
				}),
			validateUsageError(/synchronous callback/),
		);
		array.transactOnContent((content) => content.insertAtStart(9));
		assert.deepEqual(endpoints(array, range), [2, 4]);
	});

	it("supports object content and range data without string-specific APIs", () => {
		class Item extends sf.object("Item", { value: sf.number }) {}
		class Comment extends sf.object("Comment", { message: sf.string }) {}
		class Objects extends ArrayWithExtrinsicRanges.createSchema(
			new SchemaFactoryBeta("test.extrinsicRanges.objects"),
			Comment,
			[Item, SchemaFactory.null],
		) {}
		const array = Objects.create([{ value: 1 }, null]);
		const range = array.addExtrinsicRange(0, 2, { message: "review" });
		range.data.message = "updated";
		array.transactOnContent((content) => content.insertAt(1, { value: 2 }));
		assert.equal(array.getExtrinsicRange(range).end, 3);
		assert.equal(range.data.message, "updated");
		const first = array.content[0];
		assert(first instanceof Item);
		first.value = 10;
		assert.equal(array.getExtrinsicRange(range).end, 3);
	});

	it("supports recursive parameter schemas", () => {
		class Item extends sf.objectRecursive("RecursiveItem", {
			children: sf.optionalRecursive([() => RecursiveArray]),
		}) {}
		class RecursiveArray extends ArrayWithExtrinsicRanges.createSchema(
			new SchemaFactoryBeta("test.extrinsicRanges.recursive"),
			sf.null,
			[Item],
		) {}
		type _check = ValidateRecursiveSchema<typeof Item>;
		const child = RecursiveArray.create();
		child.transactOnContent((content) => content.insertAt(0, new Item({})));
		const parent = RecursiveArray.create([new Item({ children: child })]);
		assert.equal(parent.content[0]?.children?.content.length, 1);
	});

	it("keeps schema parameterizations distinct in the same document", () => {
		const Other = ArrayWithExtrinsicRanges.createSchema(
			new SchemaFactoryBeta("test.extrinsicRanges.other"),
			sf.null,
			sf.string,
		);
		class Root extends sf.object("Root", { numbers: ArrayWithRanges, strings: Other }) {}
		const view = getView(new TreeViewConfiguration({ schema: Root }));
		view.initialize({ numbers: ArrayWithRanges.create([1]), strings: Other.create(["a"]) });
		view.root.numbers.transactOnContent((content) => content.insertAt(0, 2));
		view.root.strings.transactOnContent((content) => content.insertAt(1, "b"));
		assert.deepEqual([...view.root.numbers.content], [2, 1]);
		assert.deepEqual([...view.root.strings.content], ["a", "b"]);
		assert.notEqual(ArrayWithRanges.identifier, Other.identifier);
	});

	it("erases constructors and unsafe mutation APIs while preserving inferred types", () => {
		const check = (array: NodeFromSchema<typeof ArrayWithRanges>): void => {
			const item: number | undefined = array.content[0];
			const data: string | undefined = array.ranges[0]?.data;
			allowUnused(item);
			allowUnused(data);
			const arrayNode: ReadonlyArrayNode<number> = array.content;
			allowUnused(arrayNode);
			// @ts-expect-error Stored field constructors are hidden.
			new ArrayWithRanges({ content: [], ranges: [] });
			// @ts-expect-error Content mutation must go through the manager.
			allowUnused(array.content.insertAt);
			// @ts-expect-error Range membership is controlled by the manager.
			allowUnused(array.ranges.push);
			const range = array.addExtrinsicRange(0, 0, "range");
			// @ts-expect-error Endpoints must be changed through the manager.
			range.start = 1;
			array.transactOnContent((content) => {
				// @ts-expect-error Content types are preserved.
				content.insertAt(0, "not a number");
			});
			// @ts-expect-error Endpoints must be read through the manager.
			allowUnused(range.end);
			// @ts-expect-error Forwarded array edits are not exposed.
			allowUnused(array.insertAt);
			// @ts-expect-error Range data types are preserved.
			array.addExtrinsicRange(0, 0, 123);
		};
		allowUnused(check);
		const node = ArrayWithRanges.create();
		assert(node instanceof ArrayWithRanges);
	});

	it("has a stable stored schema", () => {
		testSchemaCompatibilitySnapshots(config, "3.6.0", "array-with-extrinsic-ranges");
	});

	describe("collaboration", () => {
		const edits = {
			insert: (array: ArrayWithRanges): void =>
				array.transactOnContent((content) => content.insertAt(0, 9)),
			deleteContent: (array: ArrayWithRanges): void =>
				array.transactOnContent((content) => content.removeRange(2, 4)),
			move: (array: ArrayWithRanges): void =>
				array.transactOnContent((content) => content.moveToIndex(0, 4)),
			compound: (array: ArrayWithRanges): void =>
				array.transactOnContent((content) => {
					content.insertAtStart(9);
					content.removeRange(2, 4);
					array.addExtrinsicRange(0, 2, "new");
					const range = array.ranges[0];
					assert(range !== undefined);
					array.setExtrinsicRange(range, 1, 3);
				}),
			add: (array: ArrayWithRanges): void => {
				array.addExtrinsicRange(0, 2, "new");
			},
			set: (array: ArrayWithRanges): void => {
				const range = array.ranges[0];
				assert(range !== undefined);
				array.setExtrinsicRange(range, 0, 5);
			},
			remove: (array: ArrayWithRanges): void => {
				const range = array.ranges[0];
				assert(range !== undefined);
				array.removeExtrinsicRange(range);
			},
		};

		function setup(): {
			provider: TestTreeProviderLite;
			view: TreeViewAlpha<typeof ArrayWithRanges>;
		} {
			const provider = new TestTreeProviderLite(
				2,
				configuredSharedTree({
					minVersionForCollab: FluidClientVersion.v2_80,
				}).getFactory(),
			);
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize(ArrayWithRanges.create([0, 1, 2, 3, 4]));
			view.root.addExtrinsicRange(1, 4, "range");
			provider.synchronizeMessages();
			return { provider, view };
		}

		it("replicates sequential edits and their range updates", () => {
			const { provider, view } = setup();
			const other = provider.trees[1].viewWith(config);
			view.root.transactOnContent((content) => content.insertAt(0, 9));
			provider.synchronizeMessages();
			assert.deepEqual([...other.root.content], [9, 0, 1, 2, 3, 4]);
			assert.deepEqual(
				other.root.ranges.map((r) => endpoints(other.root, r)),
				[[2, 5]],
			);
			other.root.transactOnContent((content) => content.removeRange(1, 4));
			provider.synchronizeMessages();
			assert.deepEqual([...view.root.content], [9, 3, 4]);
			assert.deepEqual(
				view.root.ranges.map((r) => endpoints(view.root, r)),
				[[1, 2]],
			);
		});

		it("composes edits in an outer transaction and rolls them back together", () => {
			const { view } = setup();
			const result = view.runTransaction(() => {
				view.root.transactOnContent((content) => content.insertAt(0, 9));
				view.root.transactOnContent((content) => content.removeRange(2, 4));
				assert.deepEqual(
					view.root.ranges.map((r) => endpoints(view.root, r)),
					[[2, 3]],
				);
				return { rollback: true };
			});
			assert.equal(result.success, false);
			assert.deepEqual([...view.root.content], [0, 1, 2, 3, 4]);
			assert.deepEqual(
				view.root.ranges.map((r) => endpoints(view.root, r)),
				[[1, 4]],
			);
		});

		for (const [action, edit] of Object.entries(edits)) {
			it(`rejects a concurrent ${action} atomically`, () => {
				const { provider, view } = setup();
				const fork = view.fork();
				edit(fork.root);
				view.root.transactOnContent((content) => content.removeRange(0, 2));
				provider.synchronizeMessages();
				fork.rebaseOnto(view);
				assert.deepEqual([...fork.root.content], [2, 3, 4]);
				assert.deepEqual(
					fork.root.ranges.map((r) => [...endpoints(fork.root, r), r.data]),
					[[0, 2, "range"]],
				);
				fork.dispose();
			});

			it(`undoes and redoes ${action} atomically`, () => {
				const { provider, view } = setup();
				const snapshot = (): object => ({
					content: [...view.root.content],
					ranges: view.root.ranges.map((r) => [...endpoints(view.root, r), r.data]),
				});
				const initial = snapshot();
				const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
				edit(view.root);
				const edited = snapshot();
				provider.synchronizeMessages();
				const undo = undoStack.pop();
				assert(undo !== undefined);
				undo.revert();
				assert.deepEqual(snapshot(), initial);
				const redo = redoStack.pop();
				assert(redo !== undefined);
				redo.revert();
				assert.deepEqual(snapshot(), edited);
				unsubscribe();
			});
		}

		it("rejects edits rebased over changes elsewhere in the document", () => {
			class Root extends sf.object("DocumentWideConstraint", {
				tracked: ArrayWithRanges,
				unrelated: sf.number,
			}) {}
			const view = getView(new TreeViewConfiguration({ schema: Root }));
			view.initialize({ tracked: ArrayWithRanges.create([1]), unrelated: 0 });
			const fork = view.fork();
			fork.root.tracked.transactOnContent((content) => content.insertAt(0, 9));
			view.root.unrelated = 1;
			fork.rebaseOnto(view);
			assert.deepEqual([...fork.root.tracked.content], [1]);
			assert.equal(fork.root.unrelated, 1);
			fork.dispose();
		});

		it("resolves simultaneous client edits without mixing content and endpoints", () => {
			const { provider, view } = setup();
			const other = provider.trees[1].viewWith(config);
			view.root.transactOnContent((content) => content.insertAt(0, 9));
			other.root.transactOnContent((content) => content.removeRange(0, 2));
			provider.synchronizeMessages();
			assert.deepEqual([...other.root.content], [...view.root.content]);
			assert.deepEqual(
				other.root.ranges.map((r) => endpoints(other.root, r)),
				view.root.ranges.map((r) => endpoints(view.root, r)),
			);
			const range = view.root.ranges[0];
			assert(range !== undefined);
			const { start, end } = view.root.getExtrinsicRange(range);
			assert(
				(view.root.content.length === 6 && start === 2 && end === 5) ||
					(view.root.content.length === 3 && start === 0 && end === 2),
			);
		});

		it("rejects an undo after another edit rather than restoring stale endpoints", () => {
			const { provider, view } = setup();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
			view.root.transactOnContent((content) => content.insertAt(0, 9));
			const undo = undoStack.pop();
			assert(undo !== undefined);
			view.root.addExtrinsicRange(0, 1, "new");
			provider.synchronizeMessages();
			undo.revert();
			assert.deepEqual([...view.root.content], [9, 0, 1, 2, 3, 4]);
			assert.deepEqual(
				view.root.ranges.map((r) => endpoints(view.root, r)),
				[
					[2, 5],
					[0, 1],
				],
			);
			unsubscribe();
		});
	});
});
