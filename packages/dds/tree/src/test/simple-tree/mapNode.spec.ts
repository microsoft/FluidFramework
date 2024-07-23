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

	it("explicit construction", () => {
		class Schema extends schemaFactory.map("x", schemaFactory.number) {}
		const data = [["x", 5]] as const;
		const fromArray = new Schema(data);
		assert.deepEqual([...fromArray], data);
		const fromMap = new Schema(new Map(data));
		assert.deepEqual([...fromMap], data);
		const fromIterable = new Schema(new Map(data).entries());
		assert.deepEqual([...fromIterable], data);
	});

	describe("implicit construction", () => {
		class Schema extends schemaFactory.map("x", schemaFactory.number) {}
		class Root extends schemaFactory.object("root", { data: Schema }) {}
		const data = [["x", 5]] as const;
		// See TODO in shallowCompatibilityTest for how to enable this case.
		it.skip("fromArray", () => {
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
	});
});
