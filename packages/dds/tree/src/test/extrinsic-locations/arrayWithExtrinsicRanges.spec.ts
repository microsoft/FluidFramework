/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { asAlpha } from "../../api.js";
import { ExtrinsicLocations } from "../../extrinsic-locations/index.js";
import { FluidClientVersion } from "../../codec/index.js";
import { TreeAlpha, TreeBeta } from "../../shared-tree/index.js";
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
class ArrayWithRanges extends ExtrinsicLocations.createArraySchema({
	schemaFactory: sf,
	rangeDataSchema: SchemaFactory.string,
	contentSchema: SchemaFactory.number,
}) {}
const config = new TreeViewConfiguration({
	schema: ArrayWithRanges,
	enableSchemaValidation: true,
});

function endpoints(array: ArrayWithRanges, key: string): [number, number] {
	const { start, end } = rangeBounds(array.ranges, key);
	return [start, end];
}

function rangeSnapshot(array: ArrayWithRanges): [string, number, number, string][] {
	return [...array.ranges.keys()].sort().map((key) => {
		const range = array.ranges.getRange(key);
		assert(range !== undefined);
		return [key, ...endpoints(array, key), range.data];
	});
}

function rangeBounds(
	ranges: Pick<ExtrinsicLocations.RangeCollection<unknown>, "getRange">,
	key: string,
): ExtrinsicLocations.RangeEndpoints {
	const range = ranges.getRange(key);
	assert(range !== undefined);
	return { start: range.start.index, end: range.end.index };
}

describe("ExtrinsicLocations", () => {
	it("preserves array schema identifiers", () => {
		const identifier: ExtrinsicLocations.ArraySchemaIdentifier<"test.extrinsicRanges"> =
			ArrayWithRanges.identifier;
		assert.equal(
			identifier,
			"com.fluidframework.extrinsicRanges<test.extrinsicRanges>.Manager",
		);
	});

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
			const range = array.ranges.trackRange("range", { start: 1, end: 4 }, "comment");
			array.transactOnContent((content) => content.insertAt(0, 10, 11));
			assert.deepEqual([...array.content], [10, 11, 0, 1, 2, 3, 4]);
			assert.deepEqual([...endpoints(array, "range"), range.data], [3, 6, "comment"]);
			assert.equal(array.ranges.getRange("range")?.data, range.data);
			array.transactOnContent((content) => content.removeRange(2, 5));
			assert.deepEqual([...array.content], [10, 11, 3, 4]);
			assert.deepEqual(endpoints(array, "range"), [2, 3]);
			array.transactOnContent((content) => content.removeRange());
			assert.deepEqual(endpoints(array, "range"), [0, 0]);
			assert.equal(array.ranges.getRange("range")?.data, range.data);
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
				array.ranges.trackRange("range", { start: 1, end: 3 }, "range");
				array.transactOnContent((content) => content.insertAt(index, 9));
				assert.deepEqual(endpoints(array, "range"), expected);
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
				const range = array.ranges.trackRange("range", { start: 1, end: 3 }, "range");
				array.transactOnContent((content) => content.removeRange(start, end));
				assert.deepEqual(endpoints(array, "range"), expected);
				assert.equal(array.ranges.getRange("range")?.data, range.data);
			});
		}

		it("supports empty content, empty ranges, and no-op edits", () => {
			const array = create([]);
			array.ranges.trackRange("range", { start: 0, end: 0 }, "empty");
			array.transactOnContent((content) => {
				content.insertAt(0);
				content.removeRange();
			});
			assert.deepEqual(endpoints(array, "range"), [0, 0]);
			array.transactOnContent((content) => content.insertAt(0, 7));
			assert.deepEqual(endpoints(array, "range"), [1, 1]);
			array.transactOnContent((content) => content.removeRange(1, 1));
			assert.deepEqual(endpoints(array, "range"), [1, 1]);
			array.transactOnContent((content) => content.removeRange(0));
			assert.deepEqual(endpoints(array, "range"), [0, 0]);
		});

		it("updates overlapping ranges independently", () => {
			const array = create();
			array.ranges.trackRange("outer", { start: 0, end: 5 }, "outer");
			array.ranges.trackRange("inner", { start: 1, end: 3 }, "inner");
			array.ranges.trackRange("empty", { start: 2, end: 2 }, "empty");
			array.transactOnContent((content) => content.insertAt(2, TreeArrayNode.spread([8, 9])));
			assert.deepEqual(
				["outer", "inner", "empty"].map((key) => endpoints(array, key)),
				[
					[0, 7],
					[1, 5],
					[4, 4],
				],
			);
			array.transactOnContent((content) => content.removeRange(1, 6));
			assert.deepEqual(
				["outer", "inner", "empty"].map((key) => endpoints(array, key)),
				[
					[0, 2],
					[1, 1],
					[1, 1],
				],
			);
		});

		it("sets and removes ranges by key", () => {
			const array = create();
			array.ranges.trackRange("first", { start: 1, end: 3 }, "same");
			const second = array.ranges.trackRange("second", { start: 1, end: 3 }, "same");
			array.ranges.setRangeBounds("first", { start: 0, end: 5 });
			assert.deepEqual(endpoints(array, "first"), [0, 5]);
			assert.deepEqual(endpoints(array, "second"), [1, 3]);
			array.ranges.removeTrackedRange("first");
			assert.deepEqual([...array.ranges.keys()], ["second"]);
			assert.equal(array.ranges.getRange("second")?.data, second.data);
			assert.deepEqual([...array.content], [0, 1, 2, 3, 4]);
			assert.throws(
				() => array.ranges.removeTrackedRange("first"),
				validateUsageError(/not tracked/),
			);
			assert.throws(
				() => array.ranges.setRangeBounds("first", { start: 0, end: 0 }),
				validateUsageError(/not tracked/),
			);
			assert.equal(array.ranges.getRange("first"), undefined);
		});

		it("exposes a live collection with application-defined string keys", () => {
			const array = create();
			const ranges = array.ranges;
			assert.equal([...ranges.keys()].length, 0);
			const expected = new Map(
				["review/42", "", "__proto__", "constructor"].map((key) => [
					key,
					array.ranges.trackRange(key, { start: 0, end: 1 }, key),
				]),
			);
			assert.equal(array.ranges, ranges);
			assert.equal([...ranges.keys()].length, 4);
			assert.deepEqual([...ranges.keys()].sort(), [...expected.keys()].sort());
			for (const [key, range] of expected) {
				assert.equal(ranges.getRange(key)?.data, range.data);
				assert.deepEqual(rangeBounds(array.ranges, key), { start: 0, end: 1 });
			}
			array.ranges.removeTrackedRange("");
			assert.equal([...ranges.keys()].length, 3);
			assert.equal(ranges.getRange("") !== undefined, false);
			assert.equal(ranges.getRange(""), undefined);
			assert.deepEqual([...array.content], [0, 1, 2, 3, 4]);
		});

		it("rejects duplicate keys and supports reusing a removed key", () => {
			const array = create();
			const original = array.ranges.trackRange("review", { start: 1, end: 3 }, "original");
			const initial = JSON.stringify(array);
			assert.throws(
				() => array.ranges.trackRange("review", { start: 0, end: 1 }, "replacement"),
				validateUsageError(/already tracked/),
			);
			assert.equal(JSON.stringify(array), initial);
			array.ranges.removeTrackedRange("review");
			const replacement = array.ranges.trackRange(
				"review",
				{ start: 0, end: 2 },
				"replacement",
			);
			assert.notEqual(replacement, original);
			array.transactOnContent((content) => {
				content.insertAtStart(9);
				assert.deepEqual(rangeBounds(array.ranges, "review"), { start: 1, end: 3 });
			});
			assert.equal([...array.ranges.keys()].length, 1);
			assert.equal(array.ranges.getRange("review")?.data, "replacement");
			assert.deepEqual(rangeBounds(array.ranges, "review"), { start: 1, end: 3 });
		});

		it("rejects keys not tracked by this manager", () => {
			const array = create();
			const other = create();
			other.ranges.trackRange("other", { start: 0, end: 1 }, "other");
			for (const key of ["other", "missing"]) {
				assert.throws(
					() => array.ranges.removeTrackedRange(key),
					validateUsageError(/not tracked/),
				);
				assert.throws(
					() => array.ranges.setRangeBounds(key, { start: 0, end: 1 }),
					validateUsageError(/not tracked/),
				);
				assert.equal(array.ranges.getRange(key), undefined);
			}
		});

		it("rejects invalid endpoints before changing content or ranges", () => {
			const array = create();
			array.ranges.trackRange("range", { start: 1, end: 3 }, "range");
			for (const [start, end] of [
				[-1, 1],
				[0, 6],
				[3, 2],
				[0.5, 1],
				[0, Number.NaN],
				[0, Infinity],
			]) {
				assert.throws(
					() => array.ranges.trackRange("invalid", { start, end }, "invalid"),
					UsageError,
				);
				assert.throws(() => array.ranges.setRangeBounds("range", { start, end }), UsageError);
			}
			assert.deepEqual([...array.content], [0, 1, 2, 3, 4]);
			assert.deepEqual(endpoints(array, "range"), [1, 3]);
			assert.equal([...array.ranges.keys()].length, 1);
		});

		it("delivers content events during the callback without buffering invalidation", () => {
			const array = create();
			array.ranges.trackRange("range", { start: 1, end: 4 }, "range");
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
				assert.deepEqual(endpoints(array, "range"), [2, 5]);
				content.removeAt(0);
				assert.equal(events, 2);
				assert.deepEqual(cached, [0, 1, 2, 3, 4]);
				assert.deepEqual(endpoints(array, "range"), [1, 4]);
			});
			off();
		});

		it("returns live endpoints while copied endpoints remain snapshots", () => {
			const array = create();
			const range = array.ranges.trackRange("range", { start: 1, end: 4 }, "range");
			const original = rangeBounds(array.ranges, "range");
			array.transactOnContent((content) => {
				assert.equal(content, array.content);
				content.insertAtStart(9);
				assert.deepEqual(rangeBounds(array.ranges, "range"), { start: 2, end: 5 });
				assert.deepEqual([range.start.index, range.end.index], [2, 5]);
				content.removeRange(2, 4);
				assert.deepEqual(rangeBounds(array.ranges, "range"), { start: 2, end: 3 });
			});
			assert.deepEqual(original, { start: 1, end: 4 });
			assert.deepEqual(rangeBounds(array.ranges, "range"), { start: 2, end: 3 });
			assert.deepEqual([range.start.index, range.end.index], [2, 3]);
		});

		it("rejects range mutations during a callback while allowing reads and data edits", () => {
			const array = create();
			const range = array.ranges.trackRange("range", { start: 1, end: 4 }, "original");
			array.transactOnContent((content) => {
				content.insertAtStart(9);
				assert.throws(
					() => array.ranges.trackRange("added", { start: 0, end: 2 }, "added"),
					validateUsageError(/while editing content/),
				);
				assert.throws(
					() => array.ranges.setRangeBounds("range", { start: 0, end: 2 }),
					validateUsageError(/while editing content/),
				);
				assert.throws(
					() => array.ranges.removeTrackedRange("range"),
					validateUsageError(/while editing content/),
				);
				assert.deepEqual([...array.ranges.keys()], ["range"]);
				assert.deepEqual(endpoints(array, "range"), [2, 5]);
				range.data = "replacement";
				content.insertAt(1, 8);
				assert.deepEqual([range.start.index, range.end.index], [3, 6]);
			});
			assert.deepEqual(rangeSnapshot(array), [["range", 3, 6, "replacement"]]);
			array.ranges.setRangeBounds("range", { start: 0, end: 2 });
			array.ranges.trackRange("added", { start: 0, end: 1 }, "added");
			array.ranges.removeTrackedRange("range");
			assert.deepEqual(rangeSnapshot(array), [["added", 0, 1, "added"]]);
		});

		it("uses anchors for position reads during endpoint writeback", () => {
			const array = create();
			array.ranges.trackRange("range", { start: 1, end: 4 }, "range");
			const observed: [number, number][] = [];
			const off = TreeBeta.on(array, "treeChanged", () => {
				observed.push(endpoints(array, "range"));
			});
			array.transactOnContent((content) => content.insertAtStart(9));
			off();
			assert(observed.length > 0);
			assert(observed.every(([start, end]) => start === 2 && end === 5));
		});

		for (const event of ["nodeChanged", "treeChanged"] as const) {
			it(`resolves positions from ${event} callbacks registered inside the editing scope`, () => {
				const array = create();
				array.ranges.trackRange("range", { start: 1, end: 4 }, "range");
				const observed: [number, number][] = [];
				array.transactOnContent((content) => {
					const off = TreeBeta.on(content, event, () => {
						observed.push(endpoints(array, "range"));
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
		}

		it("rejects same-manager nesting without ending the outer editing scope", () => {
			const array = create();
			array.ranges.trackRange("range", { start: 1, end: 4 }, "range");
			array.transactOnContent((content) => {
				assert.throws(
					() => array.transactOnContent(() => {}),
					validateUsageError(/Cannot nest/),
				);
				content.insertAtStart(9);
				assert.deepEqual(endpoints(array, "range"), [2, 5]);
			});
			array.transactOnContent((content) => content.removeAt(0));
			assert.deepEqual(endpoints(array, "range"), [1, 4]);
		});

		it("tracks moves within the content array", () => {
			const array = create();
			array.ranges.trackRange("range", { start: 1, end: 3 }, "range");
			array.transactOnContent((content) => {
				content.moveToIndex(0, 4);
				assert.deepEqual(endpoints(array, "range"), [2, 4]);
				content.moveRangeToEnd(0, 2);
				assert.deepEqual(endpoints(array, "range"), [0, 2]);
			});
			assert.deepEqual([...array.content], [1, 2, 3, 4, 0]);
			assert.deepEqual(endpoints(array, "range"), [0, 2]);
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
			root.source.ranges.trackRange("sourceRange", { start: 1, end: 3 }, "source");
			root.destination.ranges.trackRange(
				"destinationRange",
				{ start: 0, end: 2 },
				"destination",
			);
			root.source.transactOnContent((source) => {
				root.destination.transactOnContent((destination) => {
					destination.moveRangeToIndex(1, 1, 3, source);
					assert.deepEqual(endpoints(root.source, "sourceRange"), [1, 1]);
					assert.deepEqual(endpoints(root.destination, "destinationRange"), [0, 4]);
				});
			});
			assert.deepEqual([...root.source.content], [0]);
			assert.deepEqual([...root.destination.content], [3, 1, 2, 4]);
			assert.deepEqual(endpoints(root.source, "sourceRange"), [1, 1]);
			assert.deepEqual(endpoints(root.destination, "destinationRange"), [0, 4]);
		});
	});

	it("restores both managers after a nested transaction rolls back a move", () => {
		class Root extends sf.object("RollbackMoveRoot", {
			source: ArrayWithRanges,
			destination: ArrayWithRanges,
		}) {}
		const view = getView(new TreeViewConfiguration({ schema: Root }));
		view.initialize({
			source: ArrayWithRanges.create([0, 1, 2]),
			destination: ArrayWithRanges.create([3, 4]),
		});
		const { source, destination } = view.root;
		source.ranges.trackRange("sourceRange", { start: 1, end: 3 }, "source");
		destination.ranges.trackRange("destinationRange", { start: 0, end: 2 }, "destination");
		source.transactOnContent((sourceContent) => {
			destination.transactOnContent((destinationContent) => {
				view.runTransaction(() => {
					destinationContent.moveRangeToIndex(1, 1, 3, sourceContent);
					assert.deepEqual(endpoints(source, "sourceRange"), [1, 1]);
					assert.deepEqual(endpoints(destination, "destinationRange"), [0, 4]);
					return { rollback: true };
				});
				assert.deepEqual(endpoints(source, "sourceRange"), [1, 3]);
				assert.deepEqual(endpoints(destination, "destinationRange"), [0, 2]);
			});
			sourceContent.insertAtStart(9);
		});
		assert.deepEqual([...source.content], [9, 0, 1, 2]);
		assert.deepEqual([...destination.content], [3, 4]);
		assert.deepEqual(endpoints(source, "sourceRange"), [2, 4]);
		assert.deepEqual(endpoints(destination, "destinationRange"), [0, 2]);
		view.dispose();
	});

	it("keeps partial unhydrated edits consistent after a thrown callback and releases the scope", () => {
		const array = ArrayWithRanges.create([0, 1, 2]);
		array.ranges.trackRange("range", { start: 1, end: 3 }, "range");
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
		assert.deepEqual(endpoints(array, "range"), [2, 4]);
		array.transactOnContent((content) => content.removeAt(0));
		assert.deepEqual(endpoints(array, "range"), [1, 3]);
	});

	it("rejects promise-returning callbacks and releases the unhydrated editing scope", () => {
		const array = ArrayWithRanges.create([0, 1, 2]);
		array.ranges.trackRange("range", { start: 1, end: 3 }, "range");
		assert.throws(
			() =>
				// eslint-disable-next-line @typescript-eslint/no-misused-promises -- Verifies rejection of asynchronous callbacks.
				array.transactOnContent(async () => {
					await Promise.resolve();
				}),
			validateUsageError(/synchronous callback/),
		);
		array.transactOnContent((content) => content.insertAtStart(9));
		assert.deepEqual(endpoints(array, "range"), [2, 4]);
	});

	it("supports object content and range data without string-specific APIs", () => {
		class Item extends sf.object("Item", { value: sf.number }) {}
		class Comment extends sf.object("Comment", { message: sf.string }) {}
		class Objects extends ExtrinsicLocations.createArraySchema({
			schemaFactory: new SchemaFactoryBeta("test.extrinsicRanges.objects"),
			rangeDataSchema: Comment,
			contentSchema: [Item, SchemaFactory.null],
		}) {}
		const array = Objects.create([{ value: 1 }, null]);
		const range = array.ranges.trackRange(
			"range",
			{ start: 0, end: 2 },
			{ message: "review" },
		);
		range.data.message = "updated";
		array.transactOnContent((content) => content.insertAt(1, { value: 2 }));
		assert.equal(rangeBounds(array.ranges, "range").end, 3);
		assert.equal(range.data.message, "updated");
		range.data = { message: "replacement" };
		assert.equal(range.data.message, "replacement");
		assert.equal(array.ranges.getRange("range")?.data, range.data);
		hydrateNode(array);
		range.data = new Comment({ message: "hydrated replacement" });
		assert.equal(range.data.message, "hydrated replacement");
		assert.equal(rangeBounds(array.ranges, "range").end, 3);
		const first = array.content[0];
		assert(first instanceof Item);
		first.value = 10;
		assert.equal(rangeBounds(array.ranges, "range").end, 3);
	});

	it("supports recursive parameter schemas", () => {
		class Item extends sf.objectRecursive("RecursiveItem", {
			children: sf.optionalRecursive([() => RecursiveArray]),
		}) {}
		class RecursiveArray extends ExtrinsicLocations.createArraySchema({
			schemaFactory: new SchemaFactoryBeta("test.extrinsicRanges.recursive"),
			rangeDataSchema: sf.null,
			contentSchema: [Item],
		}) {}
		type _check = ValidateRecursiveSchema<typeof Item>;
		const child = RecursiveArray.create();
		child.transactOnContent((content) => content.insertAt(0, new Item({})));
		const parent = RecursiveArray.create([new Item({ children: child })]);
		assert.equal(parent.content[0]?.children?.content.length, 1);
	});

	it("keeps schema parameterizations distinct in the same document", () => {
		const Other = ExtrinsicLocations.createArraySchema({
			schemaFactory: new SchemaFactoryBeta("test.extrinsicRanges.other"),
			rangeDataSchema: sf.null,
			contentSchema: sf.string,
		});
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
			// @ts-expect-error Schema factories require named options.
			ExtrinsicLocations.createArraySchema(sf, sf.string, sf.number);
			// @ts-expect-error Both content and range-data schemas are required.
			ExtrinsicLocations.createArraySchema({ schemaFactory: sf, contentSchema: sf.number });
			// @ts-expect-error The range creation method is named trackRange.
			allowUnused(array.ranges.trackNewRange);
			const members: ExtrinsicLocations.ArrayMembers<
				typeof SchemaFactory.string,
				typeof SchemaFactory.number
			> = array;
			allowUnused(members);
			const item: number | undefined = array.content[0];
			const data: string | undefined = array.ranges.getRange("range")?.data;
			allowUnused(item);
			allowUnused(data);
			const arrayNode: ReadonlyArrayNode<number> = array.content;
			allowUnused(arrayNode);
			// @ts-expect-error Stored field constructors are hidden.
			new ArrayWithRanges({ content: [], ranges: {} });
			// @ts-expect-error Content mutation must go through the manager.
			allowUnused(array.content.insertAt);
			// @ts-expect-error Range membership is controlled by the manager.
			allowUnused(array.ranges.set);
			// @ts-expect-error Range removal must go through the manager.
			allowUnused(array.ranges.delete);
			const range: ExtrinsicLocations.TrackedRange<string> = array.ranges.trackRange(
				"range",
				{ start: 0, end: 0 },
				"range",
			);
			// @ts-expect-error Range operations use keys, not handles.
			array.ranges.getRange(range);
			// @ts-expect-error Keys must be strings.
			array.ranges.trackRange(42, { start: 0, end: 0 }, "range");
			// @ts-expect-error Endpoints must be changed through the manager.
			range.start = 1;
			array.transactOnContent((content) => {
				// @ts-expect-error Content types are preserved.
				content.insertAt(0, "not a number");
			});
			const end: number = range.end.index;
			allowUnused(end);
			range.data = "replacement";
			// @ts-expect-error Endpoint indexes cannot be assigned.
			range.start.index = 1;
			// @ts-expect-error Replacement data retains its schema.
			range.data = 123;
			// @ts-expect-error Forwarded array edits are not exposed.
			allowUnused(array.insertAt);
			// @ts-expect-error Range data types are preserved.
			array.ranges.trackRange("new", { start: 0, end: 0 }, 123);
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
			compound: (array: ArrayWithRanges): void => {
				TreeAlpha.context(array).runTransaction(() => {
					array.transactOnContent((content) => {
						content.insertAtStart(9);
						content.removeRange(2, 4);
					});
					array.ranges.trackRange("new", { start: 0, end: 2 }, "new");
					array.ranges.setRangeBounds("range", { start: 1, end: 3 });
				});
			},
			add: (array: ArrayWithRanges): void => {
				array.ranges.trackRange("new", { start: 0, end: 2 }, "new");
			},
			set: (array: ArrayWithRanges): void => {
				array.ranges.setRangeBounds("range", { start: 0, end: 5 });
			},
			remove: (array: ArrayWithRanges): void => {
				array.ranges.removeTrackedRange("range");
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
			view.root.ranges.trackRange("range", { start: 1, end: 4 }, "range");
			provider.synchronizeMessages();
			return { provider, view };
		}

		for (const [name, edit] of Object.entries({
			add: (array: ArrayWithRanges): void => {
				array.ranges.trackRange("added", { start: 0, end: 2 }, "added");
			},
			set: edits.set,
			remove: edits.remove,
		})) {
			it(`rejects range ${name} in an aborted nested transaction without changing anchors`, () => {
				const { view } = setup();
				const array = view.root;
				const range = array.ranges.getRange("range");
				assert(range !== undefined);
				array.transactOnContent((content) => {
					content.insertAtStart(9);
					const result = view.runTransaction(() => {
						assert.throws(() => edit(array), validateUsageError(/while editing content/));
						return { rollback: true };
					});
					assert.equal(result.success, false);
					assert.deepEqual(rangeSnapshot(array), [["range", 2, 5, "range"]]);
					content.insertAtStart(8);
					assert.deepEqual([range.start.index, range.end.index], [3, 6]);
				});
				assert.deepEqual(rangeSnapshot(array), [["range", 3, 6, "range"]]);
			});
		}

		it("replicates restored range endpoints after a nested content rollback", () => {
			const { provider, view } = setup();
			const array = view.root;
			array.transactOnContent((content) => {
				content.insertAtStart(9);
				const result = view.runTransaction(() => {
					content.removeRange();
					assert.deepEqual(endpoints(array, "range"), [0, 0]);
					return { rollback: true };
				});
				assert.equal(result.success, false);
				assert.deepEqual(endpoints(array, "range"), [2, 5]);
				content.insertAtStart(8);
			});
			provider.synchronizeMessages();
			const other = provider.trees[1].viewWith(config);
			for (const root of [array, other.root]) {
				assert.deepEqual([...root.content], [8, 9, 0, 1, 2, 3, 4]);
				assert.deepEqual(rangeSnapshot(root), [["range", 3, 6, "range"]]);
			}
		});

		it("replicates sequential edits and their range updates", () => {
			const { provider, view } = setup();
			const other = provider.trees[1].viewWith(config);
			view.root.transactOnContent((content) => content.insertAt(0, 9));
			provider.synchronizeMessages();
			assert.deepEqual([...other.root.content], [9, 0, 1, 2, 3, 4]);
			assert.deepEqual(rangeSnapshot(other.root), [["range", 2, 5, "range"]]);
			other.root.transactOnContent((content) => content.removeRange(1, 4));
			provider.synchronizeMessages();
			assert.deepEqual([...view.root.content], [9, 3, 4]);
			assert.deepEqual(rangeSnapshot(view.root), [["range", 1, 2, "range"]]);
		});

		it("merges data replacement with concurrent content edits", () => {
			const { provider, view } = setup();
			const fork = view.fork();
			const range = fork.root.ranges.getRange("range");
			assert(range !== undefined);
			range.data = "replacement";
			view.root.transactOnContent((content) => content.insertAtStart(9));
			provider.synchronizeMessages();
			fork.rebaseOnto(view);
			assert.deepEqual(rangeSnapshot(fork.root), [["range", 2, 5, "replacement"]]);
			assert.deepEqual([range.start.index, range.end.index], [2, 5]);
			view.merge(fork);
			provider.synchronizeMessages();
			const other = provider.trees[1].viewWith(config);
			assert.deepEqual(rangeSnapshot(other.root), [["range", 2, 5, "replacement"]]);
		});

		it("composes edits in an outer transaction and rolls them back together", () => {
			const { view } = setup();
			const result = view.runTransaction(() => {
				view.root.transactOnContent((content) => content.insertAt(0, 9));
				view.root.transactOnContent((content) => content.removeRange(2, 4));
				assert.deepEqual(rangeSnapshot(view.root), [["range", 2, 3, "range"]]);
				return { rollback: true };
			});
			assert.equal(result.success, false);
			assert.deepEqual([...view.root.content], [0, 1, 2, 3, 4]);
			assert.deepEqual(rangeSnapshot(view.root), [["range", 1, 4, "range"]]);
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
				assert.deepEqual(rangeSnapshot(fork.root), [["range", 0, 2, "range"]]);
				fork.dispose();
			});

			it(`undoes and redoes ${action} atomically`, () => {
				const { provider, view } = setup();
				const snapshot = (): object => ({
					content: [...view.root.content],
					ranges: rangeSnapshot(view.root),
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
			assert.deepEqual(rangeSnapshot(other.root), rangeSnapshot(view.root));
			const { start, end } = rangeBounds(view.root.ranges, "range");
			assert(
				(view.root.content.length === 6 && start === 2 && end === 5) ||
					(view.root.content.length === 3 && start === 0 && end === 2),
			);
		});

		for (const sameKey of [true, false]) {
			it(`rejects concurrent range creation atomically, same key: ${sameKey}`, () => {
				const { provider, view } = setup();
				const other = provider.trees[1].viewWith(config);
				view.root.ranges.trackRange("review", { start: 1, end: 3 }, "first");
				other.root.ranges.trackRange(
					sameKey ? "review" : "other",
					{ start: 0, end: 2 },
					"second",
				);
				provider.synchronizeMessages();
				assert.deepEqual(rangeSnapshot(view.root), [
					["range", 1, 4, "range"],
					["review", 1, 3, "first"],
				]);
				assert.deepEqual(rangeSnapshot(other.root), rangeSnapshot(view.root));
				other.root.ranges.trackRange("retry", { start: 0, end: 1 }, "after rejection");
				provider.synchronizeMessages();
				assert.deepEqual(rangeSnapshot(other.root), rangeSnapshot(view.root));
			});
		}

		it("rejects an undo after another edit rather than restoring stale endpoints", () => {
			const { provider, view } = setup();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
			view.root.transactOnContent((content) => content.insertAt(0, 9));
			const undo = undoStack.pop();
			assert(undo !== undefined);
			view.root.ranges.trackRange("new", { start: 0, end: 1 }, "new");
			provider.synchronizeMessages();
			undo.revert();
			assert.deepEqual([...view.root.content], [9, 0, 1, 2, 3, 4]);
			assert.deepEqual(rangeSnapshot(view.root), [
				["new", 0, 1, "new"],
				["range", 2, 5, "range"],
			]);
			unsubscribe();
		});
	});
});
