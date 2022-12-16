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

    // Useful for debugging the tests
    const enableLogging: boolean = false; // Set to true to see timing logs
    function logClock(m): void {
        if (enableLogging) {
            console.log(`${m} ${clock.now}`);
        }
    }

    before(() => {
        clock = useFakeTimers();
    });

    after(() => {
        clock.restore();
    });

    function assertSize(actual: MapWithExpiration<number, string>, expected: Map<number, string>) {
        assert.equal(actual.size, expected.size, "size mismatch");
    }

    function assertForEach(actual: MapWithExpiration<number, string>, expected: Map<number, string>) {
        let actualValues: string[] = [];
        let expectedValues: string[] = [];
        actual.forEach((value, key) => { actualValues[key] = value; });
        expected.forEach((value, key) => { expectedValues[key] = value; });
        assert.equal(actualValues.join(","), expectedValues.join(","), "forEach mismatch");
    }

    /**
     * Helper that takes the name of a function returning an Iterable,
     * and returns a function that ensures actual and expected yield the same result when iterated over.
     * If fnName is undefined, iterate over actual and expected directly
     **/
    const assertIterable = (fnName?: string | typeof Symbol.iterator) => function (actual: MapWithExpiration<number, string>, expected: Map<number, string>) {
        const actuals: any[] = [];
        for (const a of fnName === undefined ? actual : actual[fnName]()) { actuals.push(a); }
        const expecteds: any[] = [];
        for (const e of fnName === undefined ? expected : expected[fnName]()) { expecteds.push(e); }
        assert.deepEqual(actuals.sort(), expecteds.sort(), "Iterator mismatch");
    }

    const assertEntries = assertIterable("entries");
    const assertKeys = assertIterable("keys");
    const assertValues = assertIterable("values");
    const assertSymbolIterator = assertIterable(Symbol.iterator);
    const assertIterator = assertIterable();

    function spit(testName: string, testCallback: (assertFn) => void) {
        [
            [() => {}, "inline asserts only"] as const, // This will fail if inline asserts in the test fail
            [assertSize, "check size"] as const,
            [assertForEach, "check forEach"] as const,
            [assertEntries, "check entries"] as const,
            [assertKeys, "check keys"] as const,
            [assertValues, "check values"] as const,
            [assertSymbolIterator, "check Symbol.iterator"] as const,
            [assertIterator, "check Iterator"] as const,
        ].forEach(([assertFn, caseName]) => {
            it(`${testName} (${caseName})`, () => {
                testCallback(assertFn);
            })
        });
    }

    spit("expiry", (assertMatches: (actual: MapWithExpiration<number, string>, expected: Map<number, string>) => void) => {
        const expiryMs = 10;
        map = new MapWithExpiration<number, string>(expiryMs);
        const expected = new Map<number, string>();

        logClock("start");

        map.set(1, "one");
        map.set(9, "nine");
        expected.set(1, "one");
        expected.set(9, "nine");

        clock.tick(9);
        assert(map.has(1), "shouldn't be expired yet");
        assert.notEqual(map.get(1), undefined, "shouldn't be expired yet");
        assertMatches(map, expected);

        clock.tick(1);
        expected.clear();

        assert(!map.has(1), "should be expired now");
        assert.equal(map.get(1), undefined, "should be expired now");
        assertMatches(map, expected);
    });
});
