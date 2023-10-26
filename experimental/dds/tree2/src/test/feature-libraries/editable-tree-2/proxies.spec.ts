/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../../domains";
import { node, typeNameSymbol } from "../../../feature-libraries";
import { itWithRoot, pretty } from "./utils";

describe("SharedTree proxies", () => {
	const sb = new SchemaBuilder({
		scope: "test",
	});

	const childSchema = sb.object("object", {
		content: sb.number,
	});

	const parentSchema = sb.object("parent", {
		struct: childSchema,
		list: sb.fieldNode("list", sb.sequence(sb.number)),
		map: sb.map("map", sb.optional(sb.string)),
	});

	const schema = sb.intoSchema(parentSchema);

	const initialTree = {
		struct: { content: 42 },
		list: [42, 42, 42],
		map: new Map([
			["foo", "Hello"],
			["bar", "World"],
		]),
	};

	itWithRoot("cache and reuse structs", schema, initialTree, (root) => {
		const structProxy = root.struct;
		const structProxyAgain = root.struct;
		assert.equal(structProxyAgain, structProxy);
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
	});

	describe("moving items", () => {
		describe("within the same list", () => {
			const _ = new SchemaBuilder({ scope: "test" });
			const schema = _.intoSchema(_.list(_.number));
			const initialTree = [0, 1, 2, 3];

			itWithRoot("moveToStart()", schema, initialTree, (list) => {
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveToStart(/* sourceStart: */ 1, /* sourceEnd: */ 3);
				assert.deepEqual(list, [1, 2, 0, 3]);
			});

			itWithRoot("moveToEnd()", schema, initialTree, (list) => {
				assert.deepEqual(list, [0, 1, 2, 3]);
				list.moveToEnd(/* sourceStart: */ 1, /* sourceEnd: */ 3);
				assert.deepEqual(list, [0, 3, 1, 2]);
			});

			describe("moveToIndex()", () => {
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
							list.moveToIndex(index, start, end);
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
				listB.moveToStart(/* sourceStart: */ 0, /* sourceEnd: */ 1, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["a0", "b0", "b1"]);
			});

			itWithRoot("moveToEnd()", schema, initialTree, ({ listA, listB }) => {
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveToEnd(/* sourceStart: */ 0, /* sourceEnd: */ 1, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["b0", "b1", "a0"]);
			});

			itWithRoot("moveToIndex()", schema, initialTree, ({ listA, listB }) => {
				assert.deepEqual(listA, ["a0", "a1"]);
				assert.deepEqual(listB, ["b0", "b1"]);
				listB.moveToIndex(/* index: */ 1, /* sourceStart: */ 0, /* sourceEnd: */ 1, listA);
				assert.deepEqual(listA, ["a1"]);
				assert.deepEqual(listB, ["b0", "a0", "b1"]);
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
});
