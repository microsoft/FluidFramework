/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { convertSortedNumberArrayToRanges } from "../array";

describe("convertToRanges", () => {
    it("Should return empty array if input is empty", () => {
        const SNs: number[] = [];
        const ranges = convertSortedNumberArrayToRanges(SNs);
        assert.strictEqual(JSON.stringify(ranges), JSON.stringify([]));
    });

    it("Should return single tuple if just one element", () => {
        const SNs: number[] = [1];
        const ranges = convertSortedNumberArrayToRanges(SNs);
        assert.strictEqual(JSON.stringify(ranges), JSON.stringify([[1, 1]]));
    });

    it("Should return single tuple if just three consequence element", () => {
        const SNs: number[] = [1, 2, 3];
        const ranges = convertSortedNumberArrayToRanges(SNs);
        assert.strictEqual(JSON.stringify(ranges), JSON.stringify([[1, 3]]));
    });

    it("Should return two tuples if just three consequence element and one element", () => {
        const SNs: number[] = [1, 2, 3, 5];
        const ranges = convertSortedNumberArrayToRanges(SNs);
        assert.strictEqual(
            JSON.stringify(ranges),
            JSON.stringify([
                [1, 3],
                [5, 5],
            ]),
        );
    });

    it("Should return two tuples if just three consequence element and two consequence element", () => {
        const SNs: number[] = [1, 2, 3, 5, 6];
        const ranges = convertSortedNumberArrayToRanges(SNs);
        assert.strictEqual(
            JSON.stringify(ranges),
            JSON.stringify([
                [1, 3],
                [5, 6],
            ]),
        );
    });

    it("Should return three tuples if just three consequence element and two consequence element", () => {
        const SNs: number[] = [1, 3, 5];
        const ranges = convertSortedNumberArrayToRanges(SNs);
        assert.strictEqual(
            JSON.stringify(ranges),
            JSON.stringify([
                [1, 1],
                [3, 3],
                [5, 5],
            ]),
        );
    });

    it("Should return one tuple for one consequence big array", () => {
        const SNs: number[] = Array.from(Array(1000).keys());
        const ranges = convertSortedNumberArrayToRanges(SNs);
        assert.strictEqual(JSON.stringify(ranges), JSON.stringify([[0, 999]]));
    });
});
