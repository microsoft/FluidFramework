/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SchemaFactory } from "../../simple-tree/index.js";
import { hydrate } from "./utils.js";
import { Tree } from "../../shared-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { isTreeNode } from "../../simple-tree/proxies.js";

const schemaFactory = new SchemaFactory("Test");

describe("MapNode", () => {
	describe("forEach", () => {
		it("non-leaf children", () => {
			class Child extends schemaFactory.map("child", schemaFactory.number) {}
			class Schema extends schemaFactory.map("x", Child) {}
			const node = hydrate(Schema, new Map([["a", new Map()]]));
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
			const node = hydrate(Schema, new Map([["b", 1]]));
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

		// Ensure map enumeration respects insert ordering, in accordance with JavaScript map spec:
		// <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map>
		it("Enumeration ordering", () => {
			class Schema extends schemaFactory.map("x", schemaFactory.number) {}
			const node = hydrate(
				Schema,
				new Map([
					["b", 2],
					["c", 1],
				]),
			);

			function assertEnumerationOrdering(expectedEntries: [string, number][]) {
				const expectedKeys = expectedEntries.map(([key]) => key);
				const expectedValues = expectedEntries.map(([, value]) => value);

				assert.deepEqual([...node.entries()], expectedEntries);
				assert.deepEqual([...node.keys()], expectedKeys);
				assert.deepEqual([...node.values()], expectedValues);

				let i = 0;
				for (const entry of node) {
					assert.deepEqual(entry, expectedEntries[i]);
					i++;
				}
			}

			// Assert initial ordering is correct
			assertEnumerationOrdering([
				["b", 2],
				["c", 1],
			]);

			// Insert some items and assert again
			node.set("a", 3);
			node.set("d", -1);
			assertEnumerationOrdering([
				["b", 2],
				["c", 1],
				["a", 3],
				["d", -1],
			]);

			// Remove an item and assert again
			node.delete("c");
			assertEnumerationOrdering([
				["b", 2],
				["a", 3],
				["d", -1],
			]);

			// Re-insert the removed item and assert that it appears at the end
			node.set("c", 1);
			assertEnumerationOrdering([
				["b", 2],
				["a", 3],
				["d", -1],
				["c", 1],
			]);
		});
	});

	describe("prototype", () => {
		it("customizable", () => {
			class Schema extends schemaFactory.map("x", schemaFactory.number) {}
			const node = hydrate(Schema, new Map());
			assert.equal(Reflect.getPrototypeOf(node), Schema.prototype);
		});

		it("pojo-emulation", () => {
			const Schema = schemaFactory.map(schemaFactory.number);
			const node = hydrate(Schema, new Map());
			assert.equal(Reflect.getPrototypeOf(node), Map.prototype);
		});
	});
});
