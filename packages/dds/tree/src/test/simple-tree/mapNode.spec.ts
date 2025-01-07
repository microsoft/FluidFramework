/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, type NodeFromSchema } from "../../simple-tree/index.js";
import { describeHydration } from "./utils.js";
import { Tree } from "../../shared-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { isTreeNode } from "../../simple-tree/core/index.js";

const schemaFactory = new SchemaFactory("Test");

const object = schemaFactory.object("object", { content: schemaFactory.number });

const schema = schemaFactory.object("parent", {
	map: schemaFactory.map(schemaFactory.string),
	objectMap: schemaFactory.map(object),
});

const initialTree = {
	map: new Map([
		["foo", "Hello"],
		["bar", "World"],
	]),
	objectMap: new Map(),
};

describeHydration(
	"MapNode",
	(init) => {
		describe("forEach", () => {
			it("non-leaf children", () => {
				class Child extends schemaFactory.map("child", schemaFactory.number) {}
				class Schema extends schemaFactory.map("x", Child) {}
				const node = init(Schema, new Map([["a", new Map()]]));
				const log: string[] = [];
				node.forEach((child, key) => {
					isTreeNode(child);
					assert.equal(child, node.get("a"));
					assert(Tree.is(child, Child));
					log.push(key);
				});
				assert.deepEqual(log, ["a"]);
			});

			it("thisArg", () => {
				class Schema extends schemaFactory.map("x", schemaFactory.number) {}
				const node = init(Schema, new Map([["b", 1]]));
				const log: string[] = [];
				const thisArg = {};
				function callback(
					this: object,
					child: number,
					key: string,
					map: ReadonlyMap<string, number>,
				): void {
					log.push(key);
					assert.equal(this, thisArg);
					assert.equal(child, 1);
					assert.equal(map, node);
				}
				node.forEach(callback, thisArg);
				assert.deepEqual(log, ["b"]);
			});
		});

		describe("prototype", () => {
			it("customizable", () => {
				class Schema extends schemaFactory.map("x", schemaFactory.number) {}
				const node = init(Schema, new Map());
				assert.equal(Reflect.getPrototypeOf(node), Schema.prototype);
			});

			it("pojo-emulation", () => {
				const Schema = schemaFactory.map(schemaFactory.number);
				const node = init(Schema, new Map());
				assert.equal(Reflect.getPrototypeOf(node), Map.prototype);
			});
		});

		it("constructor", () => {
			class Schema extends schemaFactory.map("x", schemaFactory.number) {
				// Adds a member to the derived class which allows these tests to detect if the constructed value isn't typed with the derived class.
				public foo(): void {}
			}
			const _fromMap: Schema = new Schema(new Map());
			const _fromIterable: Schema = new Schema([]);
			const _fromObject: Schema = new Schema({});
			const _fromUndefined: Schema = new Schema(undefined);
			const _fromNothing: Schema = new Schema();
		});

		it("create - NonClass", () => {
			const Schema = schemaFactory.map(schemaFactory.number);
			type Schema = NodeFromSchema<typeof Schema>;
			const _fromMap: Schema = Schema.create(new Map());
			const _fromIterable: Schema = Schema.create([]);
			const _fromObject: Schema = Schema.create({});
			const _fromUndefined: Schema = Schema.create(undefined);
			const _fromNothing: Schema = Schema.create();
		});

		it("constructor - recursive", () => {
			class Schema extends schemaFactory.mapRecursive("x", [() => Schema]) {
				// Adds a member to the derived class which allows these tests to detect if the constructed value isn't typed with the derived class.
				public foo(): void {}
			}
			const _fromMap: Schema = new Schema(new Map());
			const _fromIterable: Schema = new Schema([]);
			// Unsupported due to breaking recursive types.
			// const _fromObject: Schema = new Schema({});
			const _fromUndefined: Schema = new Schema(undefined);
			const _fromNothing: Schema = new Schema();
		});

		it("entries", () => {
			const root = init(schema, initialTree);
			assert.deepEqual(Array.from(root.map.entries()), [
				["foo", "Hello"],
				["bar", "World"],
			]);
		});

		it("keys", () => {
			const root = init(schema, initialTree);
			assert.deepEqual(Array.from(root.map.keys()), ["foo", "bar"]);
		});

		it("values", () => {
			const root = init(schema, initialTree);
			assert.deepEqual(Array.from(root.map.values()), ["Hello", "World"]);
		});

		it("iteration", () => {
			const root = init(schema, initialTree);
			const result = [];
			for (const entry of root.map) {
				result.push(entry);
			}

			assert.deepEqual(result, [
				["foo", "Hello"],
				["bar", "World"],
			]);
		});

		it("forEach", () => {
			const root = init(schema, initialTree);
			const result: [string, string][] = [];
			root.map.forEach((v, k, m) => {
				result.push([k, v]);
				assert.equal(m, root.map);
			});

			assert.deepEqual(result, [
				["foo", "Hello"],
				["bar", "World"],
			]);
		});

		it("forEach (bound)", () => {
			const root = init(schema, initialTree);
			const result: [string, string][] = [];
			root.map.forEach(function (this: typeof result, v, k, m) {
				this.push([k, v]); // Accessing `result` via `this` to ensure that `thisArg` is respected
				assert.equal(m, root.map);
			}, result);

			assert.deepEqual(result, [
				["foo", "Hello"],
				["bar", "World"],
			]);
		});

		it("has", () => {
			const root = init(schema, initialTree);
			assert.equal(root.map.has("foo"), true);
			assert.equal(root.map.has("bar"), true);
			assert.equal(root.map.has("baz"), false);
		});

		it("set", () => {
			const root = init(schema, initialTree);
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
			const root = init(schema, initialTree);
			const o = new object({ content: 42 });
			root.objectMap.set("foo", o);
			assert.equal(root.objectMap.get("foo"), o); // Check that the inserted and read proxies are the same object
			assert.equal(root.objectMap.get("foo")?.content, o.content);
		});

		it("delete", () => {
			const root = init(schema, initialTree);
			// Delete existing value
			root.map.delete("bar");
			assert.equal(root.map.size, 1);
			assert(!root.map.has("bar"));

			// Delete non-present value
			root.map.delete("baz");
			assert.equal(root.map.size, 1);
		});
	},
	() => {
		it("explicit construction", () => {
			class Schema extends schemaFactory.map("x", schemaFactory.number) {}
			const data = [["x", 5]] as const;
			const fromArray = new Schema(data);
			assert.deepEqual([...fromArray], data);
			const fromMap = new Schema(new Map(data));
			assert.deepEqual([...fromMap], data);
			const fromIterable = new Schema(new Map(data).entries());
			assert.deepEqual([...fromIterable], data);
			const fromRecord = new Schema({ x: 5 });
			assert.deepEqual([...fromRecord], data);
		});

		describe("implicit construction", () => {
			class Schema extends schemaFactory.map("x", schemaFactory.number) {}
			class Root extends schemaFactory.object("root", { data: Schema }) {}
			const data = [["x", 5]] as const;
			it("fromArray", () => {
				const fromArray = new Root({ data });
				assert.deepEqual([...fromArray.data], data);
			});
			it("fromMap", () => {
				const fromMap = new Root({ data: new Map(data) });
				assert.deepEqual([...fromMap.data], data);
			});
			it("fromIterable", () => {
				const fromIterable = new Root({ data: new Map(data).entries() });
				assert.deepEqual([...fromIterable.data], data);
			});
			it("fromRecord", () => {
				const fromRecord = new Root({ data: { x: 5 } });
				assert.deepEqual([...fromRecord.data], data);
			});
		});
	},
);
