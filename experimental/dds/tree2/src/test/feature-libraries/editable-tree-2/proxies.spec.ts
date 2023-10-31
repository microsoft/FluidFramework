/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../../domains";
import { ProxyNode, ProxyRoot, node, typeNameSymbol } from "../../../feature-libraries";
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
		list: sb.fieldNode("list", sb.sequence(sb.number)),
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
		polyValue: [sb.number, sb.string],
		polyChild: [numberChild, stringChild],
		polyValueChild: [sb.number, numberChild],
		map: sb.map("map", sb.optional(sb.string)),
		list: sb.list(numberChild),
	});

	const schema = sb.intoSchema(parentSchema);

	const initialTree = {
		content: 42,
		child: { content: 42 },
		polyValue: "42",
		polyChild: { content: "42", [typeNameSymbol]: stringChild.name },
		polyValueChild: { content: 42 },
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
		list: [{ content: 42 }, { content: 42 }],
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
		if (node.is(root.polyChild, numberChild)) {
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
			if (node.is(root.polyValueChild, numberChild)) {
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
});

describe("SharedTreeList", () => {
	describe("inserting nodes created by factory", () => {
		const _ = new SchemaBuilder({ scope: "test" });
		const obj = _.object("Obj", { id: _.string });
		const schema = _.intoSchema(_.list(obj));

		itWithRoot("insertAtStart()", schema, [{ id: "B" }], (list) => {
			assert.deepEqual(list, [{ id: "B" }]);
			const newItem = obj.create({ id: "A" });
			list.insertAtStart([newItem]);
			assert.deepEqual(list, [{ id: "A" }, { id: "B" }]);
		});

		itWithRoot("insertAtEnd()", schema, [{ id: "A" }], (list) => {
			assert.deepEqual(list, [{ id: "A" }]);
			const newItem = obj.create({ id: "B" });
			list.insertAtEnd([newItem]);
			assert.deepEqual(list, [{ id: "A" }, { id: "B" }]);
		});

		itWithRoot("insertAt()", schema, [{ id: "A" }, { id: "C" }], (list) => {
			assert.deepEqual(list, [{ id: "A" }, { id: "C" }]);
			const newItem = obj.create({ id: "B" });
			list.insertAt(1, [newItem]);
			assert.deepEqual(list, [{ id: "A" }, { id: "B" }, { id: "C" }]);
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
				root: ProxyRoot<typeof schema>,
				list: "a" | "b",
			): ProxyNode<typeof listA> | ProxyNode<typeof listB> {
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

	const rootSchema = sb.object("parent", {
		map: sb.map("map", sb.optional(sb.string)),
	});

	const schema = sb.intoSchema(rootSchema);

	const initialTree = {
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
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
});
