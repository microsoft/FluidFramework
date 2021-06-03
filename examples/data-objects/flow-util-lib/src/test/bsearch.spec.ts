/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { bsearch } from "../bsearch";
import { bsearch2Shim } from "./bsearch2Shim";

describe("bsearch", () => {
    it("empty array", () => {
        const array = [];
        assert.equal(bsearch(array, 0), 0);
    });

    it("searches all positions", () => {
        const array: number[] = [];
        for (let j = 0; j < 5; j++) {
            assert.equal(bsearch(array, array.length), array.length);

            array.push(j);
            for (let i = 0; i < array.length; i++) {
                assert.equal(bsearch(array, i), i);
            }
        }
    });

    it("returns leftmost match", () => {
        const array: number[] = [];
        for (let j = 0; j < 7; j++) {
            array.unshift(0);
            array.fill(0);
            for (let i = array.length - 1; i >= 0; i--) {
                array[i] = 1;
                const found = bsearch(array, 1);
                assert.equal(found, i);
            }
        }
    });

    it("constrained by start", () => {
        const array = [0, 1, 2, 3, 4];
        for (let i = 0; i < array.length; i++) {
            const found = bsearch(array, 0, /* start: */ i);
            assert.equal(found, i);
        }
    });

    it("constrained by end", () => {
        const array = [0, 1, 2, 3, 4];
        // Note: bsearch 'end' argument is exclusive
        for (let i = array.length; i >= 1; i--) {
            const found = bsearch(array, 5, /* start: */ 0, /* end: */ i);
            assert.equal(found, i);
        }
    });
});

describe("bsearch2", () => {
    it("empty array", () => {
        const array = [];
        assert.equal(bsearch2Shim(array, 0), 0);
    });

    it("searches all positions", () => {
        const array: number[] = [];
        for (let j = 0; j < 5; j++) {
            assert.equal(bsearch2Shim(array, array.length), array.length);

            array.push(j);
            for (let i = 0; i < array.length; i++) {
                assert.equal(bsearch2Shim(array, i), i);
            }
        }
    });

    it("returns leftmost match", () => {
        const array: number[] = [];
        for (let j = 0; j < 7; j++) {
            array.unshift(0);
            array.fill(0);
            for (let i = array.length - 1; i >= 0; i--) {
                array[i] = 1;
                const found = bsearch2Shim(array, 1);
                assert.equal(found, i);
            }
        }
    });

    it("constrained by start", () => {
        const array = [0, 1, 2, 3, 4];
        for (let i = 0; i < array.length; i++) {
            const found = bsearch2Shim(array, 0, /* start: */ i);
            assert.equal(found, i);
        }
    });

    it("constrained by end", () => {
        const array = [0, 1, 2, 3, 4];
        // Note: bsearch 'end' argument is exclusive
        for (let i = array.length; i >= 1; i--) {
            const found = bsearch2Shim(array, 5, /* start: */ 0, /* end: */ i);
            assert.equal(found, i);
        }
    });
});
