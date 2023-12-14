/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockHandle } from "@fluidframework/test-runtime-utils";
import { NodeFromSchema, SchemaFactory, Tree } from "../../class-tree";
import { TreeArrayNode } from "../../simple-tree";
import { getRoot, pretty } from "./utils";

describe("SharedTree proxies", () => {
	const sb = new SchemaFactory("test");

	const childSchema = sb.object("object", {
		content: sb.number,
	});

	const schema = sb.object("parent", {
		object: childSchema,
		list: sb.array(sb.number),
		// Is there a way to avoid the cast to 'any' when using 'class-schema'?
		// TODO: https://dev.azure.com/fluidframework/internal/_workitems/edit/6551
		map: sb.map("map", sb.optional(sb.string) as any),
	});

	const initialTree = () => ({
		object: { content: 42 },
		list: [42, 42, 42],
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
	});

	// TODO: Fix proxy caching after 'schema-class' conversion.
	// https://dev.azure.com/fluidframework/internal/_workitems/edit/6557
	it.skip("cache and reuse objects", () => {
		const root = getRoot(schema, initialTree);
		const objectProxy = root.object;
		const objectProxyAgain = root.object;
		assert.equal(objectProxyAgain, objectProxy);
	});

	// TODO: Fix proxy caching after 'schema-class' conversion.
	// https://dev.azure.com/fluidframework/internal/_workitems/edit/6557
	it.skip("cache and reuse lists", () => {
		const root = getRoot(schema, initialTree);
		const listProxy = root.list;
		const listProxyAgain = root.list;
		assert.equal(listProxyAgain, listProxy);
	});

	// TODO: Fix proxy caching after 'schema-class' conversion.
	// https://dev.azure.com/fluidframework/internal/_workitems/edit/6557
	it.skip("cache and reuse maps", () => {
		const root = getRoot(schema, initialTree);
		const mapProxy = root.map;
		const mapProxyAgain = root.map;
		assert.equal(mapProxyAgain, mapProxy);
	});
});

describe("SharedTreeObject", () => {
	const sb = new SchemaFactory("test");

	const numberChild = sb.object("numberChild", {
		content: sb.number,
	});

	const stringChild = sb.object("stringChild", {
		content: sb.string,
	});

	const schema = sb.object("parent", {
		content: sb.number,
		child: numberChild,
		optional: sb.optional(numberChild),
		polyValue: [sb.number, sb.string],
		polyChild: [numberChild, stringChild],
		polyValueChild: [sb.number, numberChild],
		map: sb.map("map", sb.string),
		list: sb.array(numberChild),
		handle: sb.handle,
	});

	const initialTree = () => ({
		content: 42,
		child: { content: 42 },
		optional: { content: 42 },
		polyValue: "42",
		polyChild: new stringChild({ content: "42" }),
		polyValueChild: { content: 42 },
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
		list: [{ content: 42 }, { content: 42 }],
		handle: new MockHandle(42),
	});

	it("can read required fields", () => {
		const root = getRoot(schema, initialTree);
		assert.equal(root.content, 42);
		assert.equal(root.child.content, 42);
	});

	it("can read lists", () => {
		const root = getRoot(schema, initialTree);
		assert.equal(root.list.length, 2);
		for (const x of root.list) {
			assert.equal(x.content, 42);
		}
	});

	it("can read maps", () => {
		const root = getRoot(schema, initialTree);
		assert.equal(root.map.size, 2);
		assert.equal(root.map.get("foo"), "Hello");
		assert.equal(root.map.get("bar"), "World");
		assert.equal(root.map.get("baz"), undefined);
	});

	it("can read fields common to all polymorphic types", () => {
		const root = getRoot(schema, initialTree);
		assert.equal(root.polyChild.content, "42");
	});

	it("can narrow polymorphic value fields", () => {
		const root = getRoot(schema, initialTree);
		if (typeof root.polyValue === "number") {
			assert.equal(root.polyChild.content, 42);
		} else {
			assert.equal(root.polyChild.content, "42");
		}
	});

	it("can narrow polymorphic struct fields", () => {
		const root = getRoot(schema, initialTree);
		if (Tree.is(root.polyChild, numberChild)) {
			assert.equal(root.polyChild.content, 42);
		} else {
			assert.equal(root.polyChild.content, "42");
		}
	});

	it("can narrow polymorphic combinations of value and struct fields", () => {
		const root = getRoot(schema, initialTree);
		if (Tree.is(root.polyValueChild, numberChild)) {
			assert.equal(root.polyValueChild.content, 42);
		} else {
			assert.equal(root.polyValueChild, 42);
		}

		if (typeof root.polyValueChild === "number") {
			assert.equal(root.polyValueChild, 42);
		} else {
			assert.equal(root.polyValueChild.content, 42);
		}
	});

	// TODO:#6133: Make this properly async and check that the value of the handle is correct
	it("can read and write handles", () => {
		const root = getRoot(schema, initialTree);
		assert.notEqual(root.handle, undefined);
		root.handle = new MockHandle(43);
		assert.notEqual(root.handle, undefined);
	});

	it("can set fields", () => {
		const root = getRoot(schema, initialTree);
		assert.equal(root.child.content, 42);
		assert.equal(root.optional?.content, 42);
		const newChild = new numberChild({ content: 43 });
		root.child = newChild;
		assert.equal(root.child, newChild);
		root.optional = new numberChild({ content: 43 });
		root.optional = new numberChild({ content: 43 }); // Check that we can do a "no-op" change (a change which does not change the tree's content).
		assert.equal(root.optional.content, 43);
	});

	it("can unset fields", () => {
		const root = getRoot(schema, initialTree);
		assert.equal(root.optional?.content, 42);
		root.optional = undefined;
		assert.equal(root.optional, undefined);
	});
});

describe("SharedTreeList", () => {
	describe("inserting nodes created by factory", () => {
		const _ = new SchemaFactory("test");
		const obj = _.object("Obj", { id: _.string });
		const schema = _.array(obj);

		// TODO: Fix prototype for objects declared using 'class-schema'.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		it.skip("insertAtStart()", () => {
			const root = getRoot(schema, () => [{ id: "B" }]);
			assert.deepEqual(root, [{ id: "B" }]);
			const newItem = new obj({ id: "A" });
			root.insertAtStart(newItem);
			root.insertAtStart(); // Check that we can do a "no-op" change (a change which does not change the tree's content).
			assert.equal(newItem, root[0]); // Check that the inserted and read proxies are the same object
			assert.deepEqual(root, [newItem, { id: "B" }]);
		});

		// TODO: Fix prototype for objects declared using 'class-schema'.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		it.skip("insertAtEnd()", () => {
			const root = getRoot(schema, () => [{ id: "A" }]);
			assert.deepEqual(root, [{ id: "A" }]);
			const newItem = new obj({ id: "B" });
			root.insertAtEnd(newItem);
			root.insertAtEnd(); // Check that we can do a "no-op" change (a change which does not change the tree's content).
			assert.equal(newItem, root[1]); // Check that the inserted and read proxies are the same object
			assert.deepEqual(root, [{ id: "A" }, newItem]);
		});

		// TODO: Fix prototype for objects declared using 'class-schema'.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		it.skip("insertAt()", () => {
			const root = getRoot(schema, () => [{ id: "A" }, { id: "C" }]);
			assert.deepEqual(root, [{ id: "A" }, { id: "C" }]);
			const newItem = new obj({ id: "B" });
			root.insertAt(1, newItem);
			root.insertAt(1); // Check that we can do a "no-op" change (a change which does not change the tree's content).
			assert.equal(newItem, root[1]); // Check that the inserted and read proxies are the same object
			assert.deepEqual(root, [{ id: "A" }, newItem, { id: "C" }]);
		});

		// TODO: Fix prototype for objects declared using 'class-schema'.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/6549
		it.skip("at()", () => {
			const root = getRoot(schema, () => [{ id: "B" }]);
			assert.equal(root.at(0), root[0]);
			assert.deepEqual(root, [{ id: "B" }]);
			assert.deepEqual(root.at(0), { id: "B" });
		});

		it("at() with negative", () => {
			const root = getRoot(schema, () => [{ id: "B" }]);
			assert.equal(root.at(-1), root[0]);
			const newItem = new obj({ id: "C" });
			root.insertAt(1, newItem);
			assert.equal(root.at(-1), root[1]);
			assert.equal(root.at(-1), root.at(1));
			assert.equal(root.at(-1), newItem);
		});
	});

	describe("inserting inlined content", () => {
		const _ = new SchemaFactory("test");
		const schema = _.array(_.number);

		it("insertAtStart()", () => {
			const list = getRoot(schema, () => []);
			list.insertAtStart(TreeArrayNode.inline([0, 1]));
			assert.deepEqual(list, [0, 1]);
			list.removeRange();
			list.insertAtStart(0, TreeArrayNode.inline([1]), 2);
			assert.deepEqual(list, [0, 1, 2]);
			list.removeRange();
			list.insertAtStart(0, 1, TreeArrayNode.inline([2, 3]), 4, TreeArrayNode.inline([5, 6]));
			assert.deepEqual(list, [0, 1, 2, 3, 4, 5, 6]);
		});

		it("insertAtEnd()", () => {
			const list = getRoot(schema, () => []);
			list.insertAtEnd(TreeArrayNode.inline([0, 1]));
			assert.deepEqual(list, [0, 1]);
			list.removeRange();
			list.insertAtEnd(0, TreeArrayNode.inline([1]), 2);
			assert.deepEqual(list, [0, 1, 2]);
			list.removeRange();
			list.insertAtEnd(0, 1, TreeArrayNode.inline([2, 3]), 4, TreeArrayNode.inline([5, 6]));
			assert.deepEqual(list, [0, 1, 2, 3, 4, 5, 6]);
		});

		it("insertAt()", () => {
			const list = getRoot(schema, () => []);
			list.insertAt(0, TreeArrayNode.inline([0, 1]));
			assert.deepEqual(list, [0, 1]);
			list.removeRange();
			list.insertAt(0, 0, TreeArrayNode.inline([1]), 2);
			assert.deepEqual(list, [0, 1, 2]);
			list.removeRange();
			list.insertAt(0, 0, 1, TreeArrayNode.inline([2, 3]), 4, TreeArrayNode.inline([5, 6]));
			assert.deepEqual(list, [0, 1, 2, 3, 4, 5, 6]);
		});
	});

	describe("inserting primitive", () => {
		const _ = new SchemaFactory("test");
		const schema = _.object("Obj", {
			numbers: _.array(_.number),
			strings: _.array(_.string),
			booleans: _.array(_.boolean),
			handles: _.array(_.handle),
			poly: _.array([_.number, _.string, _.boolean, _.handle]),
		});
		const initialTree = () => ({
			numbers: [],
			strings: [],
			booleans: [],
			handles: [],
			poly: [],
		});
		it("numbers", () => {
			const root = getRoot(schema, initialTree);
			root.numbers.insertAtStart(0);
			root.numbers.insertAt(1, 1);
			root.numbers.insertAtEnd(2);
			assert.deepEqual(root.numbers, [0, 1, 2]);
		});

		it("booleans", () => {
			const root = getRoot(schema, initialTree);
			root.booleans.insertAtStart(true);
			root.booleans.insertAt(1, false);
			root.booleans.insertAtEnd(true);
			assert.deepEqual(root.booleans, [true, false, true]);
		});

		it("handles", () => {
			const root = getRoot(schema, initialTree);
			const handles = [new MockHandle(5), new MockHandle(6), new MockHandle(7)];
			root.handles.insertAtStart(handles[0]);
			root.handles.insertAt(1, handles[1]);
			root.handles.insertAtEnd(handles[2]);
			assert.deepEqual(root.handles, handles);
		});

		it("of multiple possible types", () => {
			const root = getRoot(schema, initialTree);
			const allowsStrings: typeof root.numbers | typeof root.poly = root.poly;
			allowsStrings.insertAtStart(42);
			const allowsStsrings: typeof root.strings | typeof root.poly = root.poly;
			allowsStsrings.insertAt(1, "s");
			const allowsBooleans: typeof root.booleans | typeof root.poly = root.poly;
			allowsBooleans.insertAtEnd(true);
			const handle = new MockHandle(5);
			const allowsHandles: typeof root.handles | typeof root.poly = root.poly;
			allowsHandles.insertAtEnd(handle);
			assert.deepEqual(root.poly, [42, "s", true, handle]);
		});
	});

	describe("removing items", () => {
		const _ = new SchemaFactory("test");
		const schema = _.array(_.number);

		it("removeAt()", () => {
			const list = getRoot(schema, () => [0, 1, 2]);
			assert.deepEqual(list, [0, 1, 2]);
			list.removeAt(1);
			assert.deepEqual(list, [0, 2]);
		});

		it("removeRange()", () => {
			const list = getRoot(schema, () => [0, 1, 2, 3]);
			assert.deepEqual(list, [0, 1, 2, 3]);
			list.removeRange(/* start: */ 1, /* end: */ 3);
			assert.deepEqual(list, [0, 3]);
		});

		it("removeRange() - all", () => {
			const list = getRoot(schema, () => [0, 1, 2, 3]);
			assert.deepEqual(list, [0, 1, 2, 3]);
			list.removeRange(/* start: */ 1, /* end: */ 3);
			assert.deepEqual(list, [0, 3]);
			list.removeRange();
			assert.deepEqual(list, []);
		});

		it("removeRange() - past end", () => {
			const list = getRoot(schema, () => [0, 1, 2, 3]);
			assert.deepEqual(list, [0, 1, 2, 3]);
			list.removeRange(/* start: */ 1, /* end: */ 3);
			assert.deepEqual(list, [0, 3]);
			list.removeRange(1, Infinity);
			assert.deepEqual(list, [0]);
		});

		it("removeRange() - empty range", () => {
			const list = getRoot(schema, () => [0, 1, 2, 3]);
			assert.deepEqual(list, [0, 1, 2, 3]);
			list.removeRange(2, 2);
			assert.deepEqual(list, [0, 1, 2, 3]);
		});

		it("removeRange() - empty list", () => {
			const list = getRoot(schema, () => []);
			assert.deepEqual(list, []);
			assert.throws(() => list.removeRange());
		});
	});

	describe("moving items", () => {
		describe("within the same list", () => {
			const _ = new SchemaFactory("test");
			const schema = _.array(_.number);
			const initialTree = () => [0, 1, 2, 3];

			it("moveToStart()", () => {
				const list = getRoot(schema, initialTree);
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveToStart(1);
				assert.deepEqual(list, [1, 0, 2, 3]);
			});

			it("moveToEnd()", () => {
				const list = getRoot(schema, initialTree);
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveToEnd(1);
				assert.deepEqual(list, [0, 2, 3, 1]);
			});

			it("moveToIndex()", () => {
				const list = getRoot(schema, initialTree);
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveToIndex(1, 2);
				assert.deepEqual(list, [0, 2, 1, 3]);
				list.moveToIndex(2, 1);
				assert.deepEqual(list, [0, 2, 1, 3]);
				list.moveToIndex(2, 0);
				assert.deepEqual(list, [2, 0, 1, 3]);
			});

			it("moveRangeToStart()", () => {
				const list = getRoot(schema, initialTree);
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveRangeToStart(/* sourceStart: */ 1, /* sourceEnd: */ 3);
				assert.deepEqual(list, [1, 2, 0, 3]);
			});

			it("moveRangeToEnd()", () => {
				const list = getRoot(schema, initialTree);
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveRangeToEnd(/* sourceStart: */ 1, /* sourceEnd: */ 3);
				assert.deepEqual(list, [0, 3, 1, 2]);
			});

			describe("moveRangeToIndex()", () => {
				function check(index: number, start: number, end: number) {
					const expected = initialTree().slice(0);
					// Remove the moved items from [start..end).
					const moved = expected.splice(start, /* deleteCount: */ end - start);
					// Re-insert the moved items, adjusting index as necessary.
					expected.splice(
						index <= start
							? index // If the index is <= start, it is unmodified
							: index >= end
							? index - moved.length // If the index is >= end, subtract the number of moved items.
							: start, // If the index is inside the moved window, slide it left to the starting position.
						/* deleteCount: */ 0,
						...moved,
					);

					it(`${pretty(
						initialTree,
					)}.moveToStart(dest: ${index}, start: ${start}, end: ${end}) -> ${pretty(
						expected,
					)}`, () => {
						const list = getRoot(schema, initialTree);
						assert.deepEqual(list, initialTree);
						list.moveRangeToIndex(index, start, end);
						assert.deepEqual(list, expected);
					});
				}

				for (let start = 0; start < initialTree.length; start++) {
					// TODO: Empty moves should be allowed.
					for (let end = start + 1; end <= initialTree.length; end++) {
						for (let index = 0; index <= initialTree.length; index++) {
							check(index, start, end);
						}
					}
				}
			});
		});

		describe("between different lists", () => {
			const _ = new SchemaFactory("test");

			const schema = _.object("parent", {
				listA: _.array(_.string),
				listB: _.array(_.string),
			});

			const initialTree = () => ({
				listA: ["a0", "a1"],
				listB: ["b0", "b1"],
			});

			it("moveToStart()", () => {
				const { listA, listB } = getRoot(schema, initialTree);
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveToStart(0, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["a0", "b0", "b1"]);
			});

			it("moveToEnd()", () => {
				const { listA, listB } = getRoot(schema, initialTree);
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveToEnd(0, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["b0", "b1", "a0"]);
			});

			it("moveToIndex()", () => {
				const { listA, listB } = getRoot(schema, initialTree);
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveToIndex(/* index: */ 1, /* sourceStart: */ 0, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["b0", "a0", "b1"]);
			});

			it("moveRangeToStart()", () => {
				const { listA, listB } = getRoot(schema, initialTree);
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveRangeToStart(/* sourceStart: */ 0, /* sourceEnd: */ 1, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["a0", "b0", "b1"]);
			});

			it("moveRangeToEnd()", () => {
				const { listA, listB } = getRoot(schema, initialTree);
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveRangeToEnd(/* sourceStart: */ 0, /* sourceEnd: */ 1, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["b0", "b1", "a0"]);
			});

			it("moveRangeToIndex()", () => {
				const { listA, listB } = getRoot(schema, initialTree);
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveRangeToIndex(
					/* index: */ 1,
					/* sourceStart: */ 0,
					/* sourceEnd: */ 1,
					listA,
				);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["b0", "a0", "b1"]);
			});
		});

		describe("between lists with overlapping types", () => {
			const _ = new SchemaFactory("test");

			const listA = _.array([_.string, _.number]);
			const listB = _.array([_.number, _.boolean]);

			const schema = _.object("parent", {
				listA,
				listB,
			});

			const initialTree = () => ({
				listA: ["a", 1],
				listB: [2, true],
			});

			/** This function returns a union of both listA and listB, which exercises more interesting compile type-checking cases */
			function getEitherList(
				root: NodeFromSchema<typeof schema>,
				list: "a" | "b",
			): NodeFromSchema<typeof listA> | NodeFromSchema<typeof listB> {
				return list === "a" ? root.listA : root.listB;
			}

			it("move to start", () => {
				const root = getRoot(schema, initialTree);
				const list1 = getEitherList(root, "a");
				const list2 = getEitherList(root, "b");
				list2.moveToStart(1, list1);
				assert.deepEqual(list1, ["a"]);
				assert.deepEqual(list2, [1, 2, true]);
				list1.moveRangeToStart(/* sourceStart: */ 0, /* sourceEnd: */ 2, list2);
				assert.deepEqual(list1, [1, 2, "a"]);
				assert.deepEqual(list2, [true]);
			});

			it("move to end", () => {
				const root = getRoot(schema, initialTree);
				const list1 = getEitherList(root, "a");
				const list2 = getEitherList(root, "b");
				list2.moveToEnd(1, list1);
				assert.deepEqual(list1, ["a"]);
				assert.deepEqual(list2, [2, true, 1]);
				list1.moveRangeToEnd(/* sourceStart: */ 0, /* sourceEnd: */ 1, list2);
				assert.deepEqual(list1, ["a", 2]);
				assert.deepEqual(list2, [true, 1]);
			});

			it("move to index", () => {
				const root = getRoot(schema, initialTree);
				const list1 = getEitherList(root, "a");
				const list2 = getEitherList(root, "b");
				list2.moveToIndex(/* index: */ 1, /* sourceIndex */ 1, list1);
				assert.deepEqual(list1, ["a"]);
				assert.deepEqual(list2, [2, 1, true]);
				list1.moveRangeToIndex(
					/* index: */ 0,
					/* sourceStart: */ 0,
					/* sourceEnd: */ 2,
					list2,
				);
				assert.deepEqual(list1, [2, 1, "a"]);
				assert.deepEqual(list2, [true]);
			});

			it("fails if incompatible type", () => {
				const root = getRoot(schema, initialTree);
				const list1 = getEitherList(root, "a");
				const list2 = getEitherList(root, "b");
				assert.throws(() =>
					list2.moveRangeToIndex(
						/* index: */ 0,
						/* sourceStart: */ 0,
						/* sourceEnd: */ 1,
						list1,
					),
				);
			});
		});
	});
});

describe("SharedTreeMap", () => {
	const sb = new SchemaFactory("test");

	const object = sb.object("object", { content: sb.number });

	const schema = sb.object("parent", {
		map: sb.map(sb.string),
		objectMap: sb.map(object),
	});

	const initialTree = () => ({
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
		objectMap: new Map(),
	});

	it("entries", () => {
		const root = getRoot(schema, initialTree);
		assert.deepEqual(Array.from(root.map.entries()), [
			["foo", "Hello"],
			["bar", "World"],
		]);
	});

	it("keys", () => {
		const root = getRoot(schema, initialTree);
		assert.deepEqual(Array.from(root.map.keys()), ["foo", "bar"]);
	});

	it("values", () => {
		const root = getRoot(schema, initialTree);
		assert.deepEqual(Array.from(root.map.values()), ["Hello", "World"]);
	});

	it("iteration", () => {
		const root = getRoot(schema, initialTree);
		const result = [];
		for (const entry of root.map) {
			result.push(entry);
		}

		assert.deepEqual(result, [
			["foo", "Hello"],
			["bar", "World"],
		]);
	});

	it("has", () => {
		const root = getRoot(schema, initialTree);
		assert.equal(root.map.has("foo"), true);
		assert.equal(root.map.has("bar"), true);
		assert.equal(root.map.has("baz"), false);
	});

	it("set", () => {
		const root = getRoot(schema, initialTree);
		// Insert new value
		root.map.set("baz", "42");
		assert.equal(root.map.size, 3);
		assert(root.map.has("baz"));
		assert.equal(root.map.get("baz"), "42");

		// Override existing value
		root.map.set("baz", "37");
		root.map.set("baz", "37"); // Check that we can do a "no-op" change (a change which does not change the tree's content).
		assert.equal(root.map.size, 3);
		assert(root.map.has("baz"));
		assert.equal(root.map.get("baz"), "37");

		// "Un-set" existing value
		root.map.set("baz", undefined);
		assert.equal(root.map.size, 2);
		assert(!root.map.has("baz"));
	});

	it("set object", () => {
		const root = getRoot(schema, initialTree);
		const o = new object({ content: 42 });
		root.objectMap.set("foo", o);
		assert.equal(root.objectMap.get("foo"), o); // Check that the inserted and read proxies are the same object
		assert.equal(root.objectMap.get("foo")?.content, o.content);
	});

	it("delete", () => {
		const root = getRoot(schema, initialTree);
		// Delete existing value
		root.map.delete("bar");
		assert.equal(root.map.size, 1);
		assert(!root.map.has("bar"));

		// Delete non-present value
		root.map.delete("baz");
		assert.equal(root.map.size, 1);
	});
});
