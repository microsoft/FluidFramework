/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { MapWithExpiration } from "../mapWithExpiration";

//* ONLY!
describe.only("MapWithExpiration", () => {
    let clock: SinonFakeTimers;
    let map: MapWithExpiration<number, string>;

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
        map = new MapWithExpiration<number, string>(expiryMs);
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
        assertMatches(map, expected, "Shouldn't be expired after 5ms");

        clock.tick(5);
        expected.delete(1);
        assertMatches(map, expected, "Should be expired after 10ms");
    });

    test("delete", (assertMatches: (actual: MapWithExpiration<number, string>, expected: Map<number, string>, message: string) => void) => {
        const expiryMs = 10;
        map = new MapWithExpiration<number, string>(expiryMs);
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
        map = new MapWithExpiration<number, string>(expiryMs);
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

    it("toString", () => {
        map = new MapWithExpiration<number, string>(0);
        assert.equal(map.toString(), "[object Map]");
    })
});
