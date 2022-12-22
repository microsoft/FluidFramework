/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// https://www.typescriptlang.org/play?#code/MYewdgzgLgBANiA5jAvDUkRwKYDoGIDcAUBtDGAajABRgBcFArgLYBG2ATgJSoB8tAB6MAhmACevFALJY8BGgAMA2gBIA3mAC+AXRgbBWxdxKlw5FgEZGAWREAHADxhWHTgBpm7LgLRhsAO4wdvY0JsRWuBDYUDSW7pbhEZa4AGYgnACiIsAAFjSpTGDAUACW4LQAbp4A1p4svOrEMC3wSDRQuaUQtZ7VMA0kWp4ARAAqABIAkgDKI0kKIyjLK6trKPOmwHAiEBAwAGIgIDBNrTDCXm7UlgBMAMwk58BsNP11A43N560Knd29GD9QbfFpaYhaUyRdJZHL5QrFMoVGi4VEiTiICCNCiBQ7HMK4F4otEYrEwYYwEYTTIAGRpAHlNsk0hlsnkCkUSuUwLRUbh0Zjsf4gkcQASXrg2KUwAATGgjABC9IAqgA5AAi82J-NJvApVNpDKZ0NZcI5iO5vJJgtOOJF+O4hLYkulcsVKo18xdsvlqvpAAVMlq+QKyfrqXTGQt2kt1nHlkzmTC2fDOUieW9AQ1TqC2ogOl0ejAPsDwvrJrNE2RYKlqAiucjsX9CyZySRUvz7PY4OJ5QBBf3+mlTTKa7jEYiLAB+M9nc-ns8TJth7JomeL9SkAjOv3a-yLJc3Q0dUp9I3pAGl5qMK3MkpOY-H40ygA

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { MapWithExpiration } from "../mapWithExpiration";

describe("MapWithExpiration", () => {
    let clock: SinonFakeTimers;

    before(() => {
        clock = useFakeTimers();
    });

    after(() => {
        clock.restore();
    });

    function assertSize(actual: MapWithExpiration<number, string>, expected: Map<number, string>, message: string) {
        assert.equal(actual.size, expected.size, `'size' mismatch (${message})`);
    }

    function assertForEach(actual: MapWithExpiration<number, string>, expected: Map<number, string>, message: string) {
        const actualValues: string[] = [];
        const expectedValues: string[] = [];
        actual.forEach((value, key) => { actualValues[key] = value; });
        expected.forEach((value, key) => { expectedValues[key] = value; });
        assert.equal(actualValues.join(","), expectedValues.join(","), `'forEach' mismatch (${message})`);
    }

    /** Asserts that actual has each key in expected (and elsewhere we assert that .keys matches) */
    function assertHas(actual: MapWithExpiration<number, string>, expected: Map<number, string>) {
        for (const k of expected.keys()) {
            assert(actual.has(k), "'has' mismatch");
        }
    }

    /** Asserts that actual.get returns the same value as expected for all keys (and elsewhere we assert that .keys matches) */
    function assertGet(actual: MapWithExpiration<number, string>, expected: Map<number, string>, message: string) {
        for (const k of expected.keys()) {
            assert.equal(actual.get(k), expected.get(k), `'get' mismatch (${message})`);
        }
    }

    /**
     * Helper that takes the name of a function returning an Iterable,
     * and returns a function that ensures actual and expected yield the same result when iterated over.
     * If fnName is undefined, iterate over actual and expected directly
     */
    const assertIterable = (fnName?: string | typeof Symbol.iterator) =>
        function (actual: MapWithExpiration<number, string>, expected: Map<number, string>, message: string) {
            const actuals: any[] = [];
            for (const a of fnName === undefined ? actual : actual[fnName]()) { actuals.push(a); }
            const expecteds: any[] = [];
            for (const e of fnName === undefined ? expected : expected[fnName]()) { expecteds.push(e); }
            assert.deepEqual(actuals.sort(), expecteds.sort(), `Iterator mismatch (${message})`);
        };

    const assertEntries = assertIterable("entries");
    const assertKeys = assertIterable("keys");
    const assertValues = assertIterable("values");
    const assertSymbolIterator = assertIterable(Symbol.iterator);
    const assertIterator = assertIterable();

    /**
     * This generates a test case per function to validate.
     * They need to be tested independently since these all have side effects
     */
    function test(testName: string, testCallback: (assertFn) => void) {
        [
            [assertSize, "check size"] as const,
            [assertForEach, "check forEach"] as const,
            [assertEntries, "check entries"] as const,
            [assertKeys, "check keys"] as const,
            [assertValues, "check values"] as const,
            [assertSymbolIterator, "check Symbol.iterator"] as const,
            [assertIterator, "check Iterator"] as const,
            [assertHas, "check has"] as const,
            [assertGet, "check get"] as const,
        ].forEach(([assertFn, caseName]) => {
            it(`${testName} (${caseName})`, () => {
                testCallback(assertFn);
            })
        });
    }

    test("Basic expiry", (assertMatches: (actual: MapWithExpiration<number, string>, expected: Map<number, string>, message: string) => void) => {
        const expiryMs = 10;
        const map = new MapWithExpiration<number, string>(expiryMs);
        const expected = new Map<number, string>();

        map.set(1, "one");
        map.set(9, "nine");
        expected.set(1, "one");
        expected.set(9, "nine");

        clock.tick(5);
        assertMatches(map, expected, "Shouldn't be expired after 5ms");

        map.get(1); // Should NOT reset the expiry, only set
        map.set(9, "niner");
        map.set(2, "two");
        expected.set(9, "niner");
        expected.set(2, "two");
        assertMatches(map, expected, "Still shouldn't be expired");

        clock.tick(5);
        expected.delete(1);
        assertMatches(map, expected, "Should be expired after 10ms unless set in the interim");
    });

    test("delete", (assertMatches: (actual: MapWithExpiration<number, string>, expected: Map<number, string>, message: string) => void) => {
        const expiryMs = 10;
        const map = new MapWithExpiration<number, string>(expiryMs);
        const expected = new Map<number, string>();

        map.set(1, "one");
        map.set(9, "nine");
        expected.set(1, "one");
        expected.set(9, "nine");

        assertMatches(map, expected, "Should have set some keys");

        map.delete(9);
        expected.delete(9);

        assertMatches(map, expected, "Should be updated by delete");
    });

    test("clear", (assertMatches: (actual: MapWithExpiration<number, string>, expected: Map<number, string>, message: string) => void) => {
        const expiryMs = 10;
        const map = new MapWithExpiration<number, string>(expiryMs);
        const expected = new Map<number, string>();

        map.set(1, "one");
        map.set(9, "nine");
        expected.set(1, "one");
        expected.set(9, "nine");

        assertMatches(map, expected, "Should have set some keys");

        map.clear();
        expected.clear();

        assertMatches(map, expected, "Should be empty after clear");
    });

    //* ONLY
    describe.only("forEach thisArg", () => {
        function runTests(testName: string, testFn: (maps: Map<any, any>[], thisArgs: any[]) => void) {
            it(testName, () => { testFn([new Map(), new MapWithExpiration(10)], ["THIS", undefined]); })
        }

        runTests("inline function callback", (maps, thisArgs) => {
            for (const thisArg of thisArgs) {
                for (const map of maps) {
                    map.set(1, "one");
                    map.forEach(function (this: any, value: string, key: number, m: Map<number, string>) {
                        assert.equal(this, thisArg, "Incorrect value for 'this'");
                    }, thisArg);
                }
            }
        });

        // function testForEachThisArg(testName: string, thisArg: any) {
        //     it(testName, () => {
        //         const plainMap = new Map();
        //         const mapWithExpiration = new MapWithExpiration(10);

        //         plainMap.set(1, "one");
        //         mapWithExpiration.set(1, "one");

        //         plainMap.forEach(function (this: any, value: string, key: number, m: Map<number, string>) {
        //             assert.equal(this, thisArg, `1 Incorrect value for 'this' (passed in ${thisArg})`);
        //         }, thisArg);
        //         mapWithExpiration.forEach(function (this: any, value: string, key: number, m: Map<number, string>) {
        //             assert.equal(this, thisArg, `2 Incorrect value for 'this' (passed in ${thisArg})`);
        //         }, thisArg);
        //     });
        // }

        // testForEachThisArg("string thisArg", "THIS");
        // testForEachThisArg("undefined thisArg", undefined);

        class Foo {
            cb(this: any, valueWhichIsExpectedThis, k, m) {
                assert.equal(this, valueWhichIsExpectedThis, "Incorrect value for 'this'");
            }
        };

        function testForEachThisArg2(testName: string, thisArg: any) {
            it(testName, () => {
                const foo = new Foo();

                const plainMap2 = new Map();
                const mapWithExpiration2 = new MapWithExpiration(10);

                plainMap2.set(1, thisArg);
                mapWithExpiration2.set(1, thisArg);

                plainMap2.forEach(foo.cb, thisArg);
                mapWithExpiration2.forEach(foo.cb, thisArg);
            });
        }

        testForEachThisArg2("string thisArg", "THIS");
        testForEachThisArg2("undefined thisArg", undefined);

        function testForEachThisArg3(testName: string, thisArg: any) {
            it(testName, () => {
                const foo = new Foo();

                const plainMap2 = new Map();
                const mapWithExpiration2 = new MapWithExpiration(10);

                plainMap2.set(1, "BOUND");
                mapWithExpiration2.set(1, "BOUND");

                plainMap2.forEach(foo.cb.bind("BOUND"), thisArg);
                mapWithExpiration2.forEach(foo.cb.bind("BOUND"), thisArg);
            });
        }

        testForEachThisArg3("string thisArg", "THIS");
        testForEachThisArg3("undefined thisArg", undefined);

        function testForEachThisArg4(testName: string, thisArg: any) {
            it(testName, () => {
                const plainMap2 = new Map();
                const mapWithExpiration2 = new MapWithExpiration(10);

                plainMap2.set(1, "THIS");
                mapWithExpiration2.set(1, "THIS");

                // @ts-expect-error Testing out improper usage of 'this'
                plainMap2.forEach(() => { assert.equal(this, undefined, "Expected 'this' to be undefined for arrow fn")}, thisArg);
                // @ts-expect-error Testing out improper usage of 'this'
                mapWithExpiration2.forEach(() => { assert.equal(this, undefined, "Expected 'this' to be undefined for arrow fn")}, thisArg);
            });
        }

        testForEachThisArg4("string thisArg", "THIS");
        testForEachThisArg4("undefined thisArg", undefined);
    });

    it("toString", () => {
        const map = new MapWithExpiration<number, string>(0);
        assert.equal(map.toString(), "[object Map]");
    });
});
