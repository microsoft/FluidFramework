/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { deepFreeze } from "../deepFreeze.js";

describe("deepFreeze", () => {
	it("freezes plain objects", () => {
		const inner: any = { c: 2 };
		const frozen: any = { a: 1, b: inner };
		deepFreeze(frozen);
		assert.throws(() => {
			frozen.a = 42;
		});
		assert.throws(() => {
			frozen.b = 42;
		});
		assert.throws(() => {
			inner.c = 42;
		});
		assert.throws(() => {
			frozen.d = 42;
		});
		assert.throws(() => {
			inner.d = 42;
		});
	});
	it("freezes arrays", () => {
		const inner: any = { c: 2 };
		const frozen: any[] = [1, inner];
		deepFreeze(frozen);
		assert.throws(() => {
			frozen[0] = 42;
		});
		assert.throws(() => {
			frozen[1] = 42;
		});
		assert.throws(() => {
			inner.c = 42;
		});
		assert.throws(() => {
			frozen[42] = 42;
		});
		assert.throws(() => {
			inner.d = 42;
		});
		assert.throws(() => {
			frozen.fill(42);
		});
		assert.throws(() => {
			frozen.copyWithin(0, 1);
		});
		assert.throws(() => {
			frozen.pop();
		});
		assert.throws(() => {
			frozen.push(42);
		});
		assert.throws(() => {
			frozen.shift();
		});
		assert.throws(() => {
			frozen.sort();
		});
		assert.throws(() => {
			frozen.splice(0, 1);
		});
		assert.throws(() => {
			frozen.unshift(42);
		});
	});
	it("freezes maps", () => {
		const innerKey: any = { k: 2 };
		const innerValue: any = { v: 2 };
		const frozen = new Map<any, any>([
			[0, 1],
			[innerKey, innerValue],
		]);
		deepFreeze(frozen);
		assert.throws(() => {
			innerKey.x = 42;
		});
		assert.throws(() => {
			innerKey.v = 42;
		});
		assert.throws(() => {
			innerValue.x = 42;
		});
		assert.throws(() => {
			innerValue.v = 42;
		});
		assert.throws(() => {
			frozen.set(0, 42);
		});
		assert.throws(() => {
			frozen.set(1, 42);
		});
		assert.throws(() => {
			frozen.set(42, 42);
		});
		assert.throws(() => {
			frozen.delete(0);
		});
		assert.throws(() => {
			frozen.clear();
		});
	});
	it("freezes sets", () => {
		const inner: any = { c: 2 };
		const frozen = new Set<any>([1, inner]);
		deepFreeze(frozen);
		assert.throws(() => {
			inner.d = 42;
		});
		assert.throws(() => {
			inner.c = 42;
		});
		assert.throws(() => {
			frozen.add(0);
		});
		assert.throws(() => {
			frozen.add(1);
		});
		assert.throws(() => {
			frozen.delete(0);
		});
		assert.throws(() => {
			frozen.clear();
		});
	});
	it("detects partially frozen maps and sets", () => {
		const map: any = new Map<number, any>([[0, 1]]);
		const set: any = new Set<number>([0, 1]);
		Object.freeze(map);
		Object.freeze(set);
		assert.throws(() => {
			deepFreeze(map);
		});
		assert.throws(() => {
			deepFreeze(set);
		});
	});
	it("frozen maps and sets are deep comparable", () => {
		const map1: any = new Map<number, any>([[0, 1]]);
		const map2: any = new Map<number, any>([[0, 1]]);
		const set1: any = new Set<number>([0, 1]);
		const set2: any = new Set<number>([0, 1]);
		deepFreeze(map1);
		deepFreeze(set1);
		assert.deepEqual(map1, map2);
		assert.deepEqual(set1, set2);
	});
	it("freezes objects that are reachable through multiple fields", () => {
		const inner: any = {
			c: new Map<number, any>([[0, 1]]),
		};
		const frozen: any = { a: inner, b: inner };
		deepFreeze(frozen);
		assert.throws(() => {
			frozen.a = 42;
		});
		assert.throws(() => {
			frozen.b = 42;
		});
		assert.throws(() => {
			inner.c = 42;
		});
		assert.throws(() => {
			frozen.d = 42;
		});
		assert.throws(() => {
			inner.d = 42;
		});
	});
});
