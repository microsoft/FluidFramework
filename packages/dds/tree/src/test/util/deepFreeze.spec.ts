/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { deepFreeze } from "../utils";

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
        const inner: any = { c: 2 };
        const frozen = new Map<number, any>([
            [0, 1],
            [1, inner],
        ]);
        deepFreeze(frozen);
        assert.throws(() => {
            inner.d = 42;
        });
        assert.throws(() => {
            inner.c = 42;
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
    it("optionally does not freeze map and set methods", () => {
        const map: any = new Map<number, any>([[0, 1]]);
        const set: any = new Set<number>([0, 1]);
        const frozen = new Map<number, any>([
            [0, map],
            [1, set],
        ]);
        deepFreeze(frozen, false);
        assert.throws(() => {
            map.c = 42;
        });
        assert.throws(() => {
            set.c = 42;
        });
        assert.doesNotThrow(() => {
            map.set(0, 42);
            set.add(5);
            set.delete(5);
            set.clear(5);
            frozen.set(0, 42);
            frozen.set(1, 42);
            frozen.set(42, 42);
            frozen.delete(0);
            frozen.clear();
        });
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
