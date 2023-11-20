/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockHandle } from "@fluidframework/test-runtime-utils";
import { SchemaBuilder } from "../../domains";
import { TypedNode, TreeRoot, Tree, TreeListNode } from "../../simple-tree";
import { typeNameSymbol } from "../../feature-libraries";
import { itWithRoot, pretty } from "./utils";

describe("SharedTree proxies", () => {
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const childSchema = sb.object("object", {
		content: sb.number,
	});

	const parentSchema = sb.object("parent", {
		object: childSchema,
		list: sb.list(sb.number),
		map: sb.map("map", sb.optional(sb.string)),
	});

	const schema = sb.intoSchema(parentSchema);

	const initialTree = {
		object: { content: 42 },
		list: [42, 42, 42],
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
	};

	itWithRoot("cache and reuse objects", schema, initialTree, (root) => {
		const objectProxy = root.object;
		const objectProxyAgain = root.object;
		assert.equal(objectProxyAgain, objectProxy);
	});

	itWithRoot("cache and reuse lists", schema, initialTree, (root) => {
		const listProxy = root.list;
		const listProxyAgain = root.list;
		assert.equal(listProxyAgain, listProxy);
	});

	itWithRoot("cache and reuse maps", schema, initialTree, (root) => {
		const mapProxy = root.map;
		const mapProxyAgain = root.map;
		assert.equal(mapProxyAgain, mapProxy);
	});
});

describe("SharedTreeObject", () => {
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const numberChild = sb.object("numberChild", {
		content: sb.number,
	});

	const stringChild = sb.object("stringChild", {
		content: sb.string,
	});

	const parentSchema = sb.object("parent", {
		content: sb.number,
		child: numberChild,
		optional: sb.optional(numberChild),
		polyValue: [sb.number, sb.string],
		polyChild: [numberChild, stringChild],
		polyValueChild: [sb.number, numberChild],
		map: sb.map("map", sb.string),
		list: sb.list(numberChild),
		handle: sb.handle,
	});

	const schema = sb.intoSchema(parentSchema);

	const initialTree = {
		content: 42,
		child: { content: 42 },
		optional: { content: 42 },
		polyValue: "42",
		polyChild: { content: "42", [typeNameSymbol]: stringChild.name },
		polyValueChild: { content: 42 },
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
		list: [{ content: 42 }, { content: 42 }],
		handle: new MockHandle(42),
	};

	itWithRoot("can read required fields", schema, initialTree, (root) => {
		assert.equal(root.content, 42);
		assert.equal(root.child.content, 42);
	});

	itWithRoot("can read lists", schema, initialTree, (root) => {
		assert.equal(root.list.length, 2);
		for (const x of root.list) {
			assert.equal(x.content, 42);
		}
	});

	itWithRoot("can read maps", schema, initialTree, (root) => {
		assert.equal(root.map.size, 2);
		assert.equal(root.map.get("foo"), "Hello");
		assert.equal(root.map.get("bar"), "World");
		assert.equal(root.map.get("baz"), undefined);
	});

	itWithRoot("can read fields common to all polymorphic types", schema, initialTree, (root) => {
		assert.equal(root.polyChild.content, "42");
	});

	itWithRoot("can narrow polymorphic value fields", schema, initialTree, (root) => {
		if (typeof root.polyValue === "number") {
			assert.equal(root.polyChild.content, 42);
		} else {
			assert.equal(root.polyChild.content, "42");
		}
	});

	itWithRoot("can narrow polymorphic struct fields", schema, initialTree, (root) => {
		if (Tree.is(root.polyChild, numberChild)) {
			assert.equal(root.polyChild.content, 42);
		} else {
			assert.equal(root.polyChild.content, "42");
		}
	});

	itWithRoot(
		"can narrow polymorphic combinations of value and struct fields",
		schema,
		initialTree,
		(root) => {
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
		},
	);

	itWithRoot("can read and write handles", schema, initialTree, (root) => {
		// TODO:#6133: When itWithRoot is removed, make this properly async and check that the value of the handle is correct
		assert.notEqual(root.handle, undefined);
		root.handle = new MockHandle(43);
		assert.notEqual(root.handle, undefined);
	});

	itWithRoot("can set fields", schema, initialTree, (root) => {
		assert.equal(root.child.content, 42);
		assert.equal(root.optional?.content, 42);
		const newChild = numberChild.create({ content: 43 });
		root.child = newChild;
		assert.equal(root.child, newChild);
		root.optional = numberChild.create(newChild);
		root.optional = numberChild.create(newChild); // Check that we can do a "no-op" change (a change which does not change the tree's content).
		assert.equal(root.optional.content, 43);
	});

	itWithRoot("can unset fields", schema, initialTree, (root) => {
		assert.equal(root.optional?.content, 42);
		root.optional = undefined;
		assert.equal(root.optional, undefined);
	});
});

describe("SharedTreeList", () => {
	describe("inserting nodes created by factory", () => {
		const _ = new SchemaBuilder({ scope: "test" });
		const obj = _.object("Obj", { id: _.string });
		const schema = _.intoSchema(_.list(obj));

		itWithRoot("insertAtStart()", schema, [{ id: "B" }], (list) => {
			assert.deepEqual(list, [{ id: "B" }]);
			const newItem = obj.create({ id: "A" });
			list.insertAtStart(newItem);
			list.insertAtStart(); // Check that we can do a "no-op" change (a change which does not change the tree's content).
			assert.equal(newItem, list[0]); // Check that the inserted and read proxies are the same object
			assert.deepEqual(list, [newItem, { id: "B" }]);
		});

		itWithRoot("insertAtEnd()", schema, [{ id: "A" }], (list) => {
			assert.deepEqual(list, [{ id: "A" }]);
			const newItem = obj.create({ id: "B" });
			list.insertAtEnd(newItem);
			list.insertAtEnd(); // Check that we can do a "no-op" change (a change which does not change the tree's content).
			assert.equal(newItem, list[1]); // Check that the inserted and read proxies are the same object
			assert.deepEqual(list, [{ id: "A" }, newItem]);
		});

		itWithRoot("insertAt()", schema, [{ id: "A" }, { id: "C" }], (list) => {
			assert.deepEqual(list, [{ id: "A" }, { id: "C" }]);
			const newItem = obj.create({ id: "B" });
			list.insertAt(1, newItem);
			list.insertAt(1); // Check that we can do a "no-op" change (a change which does not change the tree's content).
			assert.equal(newItem, list[1]); // Check that the inserted and read proxies are the same object
			assert.deepEqual(list, [{ id: "A" }, newItem, { id: "C" }]);
		});
	});

	describe("inserting inlined content", () => {
		const _ = new SchemaBuilder({ scope: "test" });
		const schema = _.intoSchema(_.list(_.number));

		itWithRoot("insertAtStart()", schema, [], (list) => {
			list.insertAtStart(TreeListNode.inline([0, 1]));
			assert.deepEqual(list, [0, 1]);
			list.removeRange();
			list.insertAtStart(0, TreeListNode.inline([1]), 2);
			assert.deepEqual(list, [0, 1, 2]);
			list.removeRange();
			list.insertAtStart(0, 1, TreeListNode.inline([2, 3]), 4, TreeListNode.inline([5, 6]));
			assert.deepEqual(list, [0, 1, 2, 3, 4, 5, 6]);
		});

		itWithRoot("insertAtEnd()", schema, [], (list) => {
			list.insertAtEnd(TreeListNode.inline([0, 1]));
			assert.deepEqual(list, [0, 1]);
			list.removeRange();
			list.insertAtEnd(0, TreeListNode.inline([1]), 2);
			assert.deepEqual(list, [0, 1, 2]);
			list.removeRange();
			list.insertAtEnd(0, 1, TreeListNode.inline([2, 3]), 4, TreeListNode.inline([5, 6]));
			assert.deepEqual(list, [0, 1, 2, 3, 4, 5, 6]);
		});

		itWithRoot("insertAt()", schema, [], (list) => {
			list.insertAt(0, TreeListNode.inline([0, 1]));
			assert.deepEqual(list, [0, 1]);
			list.removeRange();
			list.insertAt(0, 0, TreeListNode.inline([1]), 2);
			assert.deepEqual(list, [0, 1, 2]);
			list.removeRange();
			list.insertAt(0, 0, 1, TreeListNode.inline([2, 3]), 4, TreeListNode.inline([5, 6]));
			assert.deepEqual(list, [0, 1, 2, 3, 4, 5, 6]);
		});
	});

	describe("inserting primitive", () => {
		const _ = new SchemaBuilder({ scope: "test" });
		const obj = _.object("Obj", {
			numbers: _.list(_.number),
			strings: _.list(_.string),
			booleans: _.list(_.boolean),
			poly: _.list([_.number, _.string, _.boolean]),
		});
		const schema = _.intoSchema(obj);
		const initialTree = { numbers: [], strings: [], booleans: [], poly: [] };
		itWithRoot("numbers", schema, initialTree, (root) => {
			root.numbers.insertAtStart(0);
			root.numbers.insertAt(1, 1);
			root.numbers.insertAtEnd(2);
			assert.deepEqual(root.numbers, [0, 1, 2]);
		});

		itWithRoot("booleans", schema, initialTree, (root) => {
			root.booleans.insertAtStart(true);
			root.booleans.insertAt(1, false);
			root.booleans.insertAtEnd(true);
			assert.deepEqual(root.booleans, [true, false, true]);
		});

		itWithRoot("of multiple possible types", schema, initialTree, (root) => {
			const allowsStrings: typeof root.numbers | typeof root.poly = root.poly;
			allowsStrings.insertAtStart(42);
			const allowsStsrings: typeof root.strings | typeof root.poly = root.poly;
			allowsStsrings.insertAt(1, "s");
			const allowsBooleans: typeof root.booleans | typeof root.poly = root.poly;
			allowsBooleans.insertAtEnd(true);
			assert.deepEqual(root.poly, [42, "s", true]);
		});
	});

	describe("removing items", () => {
		const _ = new SchemaBuilder({ scope: "test" });
		const schema = _.intoSchema(_.list(_.number));

		itWithRoot("removeAt()", schema, [0, 1, 2], (list) => {
			assert.deepEqual(list, [0, 1, 2]);
			list.removeAt(1);
			assert.deepEqual(list, [0, 2]);
		});

		itWithRoot("removeRange()", schema, [0, 1, 2, 3], (list) => {
			assert.deepEqual(list, [0, 1, 2, 3]);
			list.removeRange(/* start: */ 1, /* end: */ 3);
			assert.deepEqual(list, [0, 3]);
		});

		itWithRoot("removeRange() - all", schema, [0, 1, 2, 3], (list) => {
			assert.deepEqual(list, [0, 1, 2, 3]);
			list.removeRange(/* start: */ 1, /* end: */ 3);
			assert.deepEqual(list, [0, 3]);
			list.removeRange();
			assert.deepEqual(list, []);
		});

		itWithRoot("removeRange() - past end", schema, [0, 1, 2, 3], (list) => {
			assert.deepEqual(list, [0, 1, 2, 3]);
			list.removeRange(/* start: */ 1, /* end: */ 3);
			assert.deepEqual(list, [0, 3]);
			list.removeRange(1, Infinity);
			assert.deepEqual(list, [0]);
		});

		itWithRoot("removeRange() - empty range", schema, [0, 1, 2, 3], (list) => {
			assert.deepEqual(list, [0, 1, 2, 3]);
			list.removeRange(2, 2);
			assert.deepEqual(list, [0, 1, 2, 3]);
		});

		itWithRoot("removeRange() - empty list", schema, [], (list) => {
			assert.deepEqual(list, []);
			assert.throws(() => list.removeRange());
		});
	});

	describe("moving items", () => {
		describe("within the same list", () => {
			const _ = new SchemaBuilder({ scope: "test" });
			const schema = _.intoSchema(_.list(_.number));
			const initialTree = [0, 1, 2, 3];

			itWithRoot("moveToStart()", schema, initialTree, (list) => {
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveToStart(1);
				assert.deepEqual(list, [1, 0, 2, 3]);
			});

			itWithRoot("moveToEnd()", schema, initialTree, (list) => {
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveToEnd(1);
				assert.deepEqual(list, [0, 2, 3, 1]);
			});

			itWithRoot("moveToIndex()", schema, initialTree, (list) => {
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveToIndex(1, 2);
				assert.deepEqual(list, [0, 2, 1, 3]);
				list.moveToIndex(2, 1);
				assert.deepEqual(list, [0, 2, 1, 3]);
				list.moveToIndex(2, 0);
				assert.deepEqual(list, [2, 0, 1, 3]);
			});

			itWithRoot("moveRangeToStart()", schema, initialTree, (list) => {
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveRangeToStart(/* sourceStart: */ 1, /* sourceEnd: */ 3);
				assert.deepEqual(list, [1, 2, 0, 3]);
			});

			itWithRoot("moveRangeToEnd()", schema, initialTree, (list) => {
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveRangeToEnd(/* sourceStart: */ 1, /* sourceEnd: */ 3);
				assert.deepEqual(list, [0, 3, 1, 2]);
			});

			describe("moveRangeToIndex()", () => {
				function check(index: number, start: number, end: number) {
					const expected = initialTree.slice(0);
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

					itWithRoot(
						`${pretty(
							initialTree,
						)}.moveToStart(dest: ${index}, start: ${start}, end: ${end}) -> ${pretty(
							expected,
						)}`,
						schema,
						initialTree,
						(list) => {
							assert.deepEqual(list, initialTree);
							list.moveRangeToIndex(index, start, end);
							assert.deepEqual(list, expected);
						},
					);
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
			const _ = new SchemaBuilder({
				scope: "test",
			});

			const objectSchema = _.object("parent", {
				listA: _.list(_.string),
				listB: _.list(_.string),
			});

			const schema = _.intoSchema(objectSchema);

			const initialTree = {
				listA: ["a0", "a1"],
				listB: ["b0", "b1"],
			};

			itWithRoot("moveToStart()", schema, initialTree, ({ listA, listB }) => {
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveToStart(0, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["a0", "b0", "b1"]);
			});

			itWithRoot("moveToEnd()", schema, initialTree, ({ listA, listB }) => {
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveToEnd(0, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["b0", "b1", "a0"]);
			});

			itWithRoot("moveToIndex()", schema, initialTree, ({ listA, listB }) => {
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveToIndex(/* index: */ 1, /* sourceStart: */ 0, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["b0", "a0", "b1"]);
			});

			itWithRoot("moveRangeToStart()", schema, initialTree, ({ listA, listB }) => {
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveRangeToStart(/* sourceStart: */ 0, /* sourceEnd: */ 1, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["a0", "b0", "b1"]);
			});

			itWithRoot("moveRangeToEnd()", schema, initialTree, ({ listA, listB }) => {
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveRangeToEnd(/* sourceStart: */ 0, /* sourceEnd: */ 1, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["b0", "b1", "a0"]);
			});

			itWithRoot("moveRangeToIndex()", schema, initialTree, ({ listA, listB }) => {
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
			const _ = new SchemaBuilder({
				scope: "test",
			});

			const listA = _.list([_.string, _.number]);
			const listB = _.list([_.number, _.boolean]);

			const objectSchema = _.object("parent", {
				listA,
				listB,
			});

			const schema = _.intoSchema(objectSchema);

			const initialTree = {
				listA: ["a", 1],
				listB: [2, true],
			};

			/** This function returns a union of both listA and listB, which exercises more interesting compile type-checking cases */
			function getEitherList(
				root: TreeRoot<typeof schema>,
				list: "a" | "b",
			): TypedNode<typeof listA> | TypedNode<typeof listB> {
				return list === "a" ? root.listA : root.listB;
			}

			itWithRoot("move to start", schema, initialTree, (root) => {
				const list1 = getEitherList(root, "a");
				const list2 = getEitherList(root, "b");
				list2.moveToStart(1, list1);
				assert.deepEqual(list1, ["a"]);
				assert.deepEqual(list2, [1, 2, true]);
				list1.moveRangeToStart(/* sourceStart: */ 0, /* sourceEnd: */ 2, list2);
				assert.deepEqual(list1, [1, 2, "a"]);
				assert.deepEqual(list2, [true]);
			});

			itWithRoot("move to end", schema, initialTree, (root) => {
				const list1 = getEitherList(root, "a");
				const list2 = getEitherList(root, "b");
				list2.moveToEnd(1, list1);
				assert.deepEqual(list1, ["a"]);
				assert.deepEqual(list2, [2, true, 1]);
				list1.moveRangeToEnd(/* sourceStart: */ 0, /* sourceEnd: */ 1, list2);
				assert.deepEqual(list1, ["a", 2]);
				assert.deepEqual(list2, [true, 1]);
			});

			itWithRoot("move to index", schema, initialTree, (root) => {
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

			itWithRoot("fails if incompatible type", schema, initialTree, (root) => {
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
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const object = sb.object("object", { content: sb.number });

	const rootSchema = sb.object("parent", {
		map: sb.map(sb.string),
		objectMap: sb.map(object),
	});

	const schema = sb.intoSchema(rootSchema);

	const initialTree = {
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
		objectMap: new Map(),
	};

	itWithRoot("entries", schema, initialTree, (root) => {
		assert.deepEqual(Array.from(root.map.entries()), [
			["foo", "Hello"],
			["bar", "World"],
		]);
	});

	itWithRoot("keys", schema, initialTree, (root) => {
		assert.deepEqual(Array.from(root.map.keys()), ["foo", "bar"]);
	});

	itWithRoot("values", schema, initialTree, (root) => {
		assert.deepEqual(Array.from(root.map.values()), ["Hello", "World"]);
	});

	itWithRoot("iteration", schema, initialTree, (root) => {
		const result = [];
		for (const entry of root.map) {
			result.push(entry);
		}

		assert.deepEqual(result, [
			["foo", "Hello"],
			["bar", "World"],
		]);
	});

	itWithRoot("has", schema, initialTree, (root) => {
		assert.equal(root.map.has("foo"), true);
		assert.equal(root.map.has("bar"), true);
		assert.equal(root.map.has("baz"), false);
	});

	itWithRoot("set", schema, initialTree, (root) => {
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

	itWithRoot("set object", schema, initialTree, (root) => {
		const o = object.create({ content: 42 });
		root.objectMap.set("foo", o);
		assert.equal(root.objectMap.get("foo"), o); // Check that the inserted and read proxies are the same object
		assert.equal(root.objectMap.get("foo")?.content, o.content);
	});

	itWithRoot("delete", schema, initialTree, (root) => {
		// Delete existing value
		root.map.delete("bar");
		assert.equal(root.map.size, 1);
		assert(!root.map.has("bar"));

		// Delete non-present value
		root.map.delete("baz");
		assert.equal(root.map.size, 1);
	});
});
