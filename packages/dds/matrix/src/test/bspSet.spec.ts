/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
    createFromKey,
    BspSet,
    compare,
    union,
    intersect,
    except,
    dense,
    empty,
    symmetricDiff,
    complement,
    SetOperations,
    forEachKey,
    Dense,
    meets,
    pair,
    Pair,
} from "../bspSet";
import { Ivl, ivlMeets, ivlCompare, ivlMeetsOrTouches, ivlJoin, ivlExcept } from "../split";

/** Represents a half-open 2D rectangle [xa,xb) x [ya,yb) */
type Rect2D = [Ivl, Ivl];

function rect2DMeets(rect1: Rect2D, rect2: Rect2D): boolean {
    const [ivl1a, ivl1b] = rect1;
    const [ivl2a, ivl2b] = rect2;
    return ivlMeets(ivl1a, ivl2a) && ivlMeets(ivl1b, ivl2b);
}

function rect2DCompare(rect1: Rect2D, rect2: Rect2D) {
    const [ivl1a, ivl1b] = rect1;
    const [ivl2a, ivl2b] = rect2;
    const cmpa = ivlCompare(ivl1a, ivl2a);
    if (cmpa === undefined) { return undefined; }
    const cmpb = ivlCompare(ivl1b, ivl2b);
    if (cmpa === 0) { return cmpb; }
    if (cmpb === 0) { return cmpa; }
    return cmpa === cmpb ? cmpa : undefined;
}

export function splitIvl(key: Ivl): Pair<Ivl> {
    const [x1, x2] = key;
    // Exponentially growing
    if (x2 === Infinity) {
        return pair<Ivl>([x1, 2 * (x1 + 1) - 1], [2 * (x1 + 1) - 1, Infinity]);
    }

    // binary searching
    // eslint-disable-next-line no-bitwise
    const median = (x1 + x2) >> 1;
    return pair<Ivl>([x1, median], [median, x2]);
}

describe("BSP-set tests", () => {
    function split(key: Rect2D): Pair<Rect2D> {
        const [[x1, x2]] = key;
        if (x2 > x1 + 1) {
            const [xLeft, xRight] = splitIvl(key[0]);
            return [
                [xLeft, key[1]],
                [xRight, key[1]],
            ];
        }

        const [yLeft, yRight] = splitIvl(key[1]);
        return [
            [key[0], yLeft],
            [key[0], yRight],
        ];
    }
    const top: Rect2D = [
        [0, Infinity],
        [0, Infinity],
    ];
    const intersectRect2D = (
        [[leftRowMin, leftRowMax], [leftColMin, leftColMax]]: Rect2D,
        [[rightRowMin, rightRowMax], [rightColMin, rightColMax]]: Rect2D,
    ): Rect2D => [
        [
            Math.max(leftRowMin, rightRowMin),
            Math.min(leftRowMax, rightRowMax),
        ],
        [
            Math.max(leftColMin, rightColMin),
            Math.min(leftColMax, rightColMax),
        ],
    ];

    function unionRect2D(
        [leftRowIvl, leftColIvl]: Rect2D,
        [rightRowIvl, rightColIvl]: Rect2D,
    ): Rect2D | undefined {
        if (
            ivlCompare(leftRowIvl, rightRowIvl) === 0 &&
            ivlMeetsOrTouches(leftColIvl, rightColIvl)
        ) {
            return [leftRowIvl, ivlJoin(leftColIvl, rightColIvl)];
        }

        if (
            ivlCompare(leftColIvl, rightColIvl) === 0 &&
            ivlMeetsOrTouches(leftRowIvl, rightRowIvl)
        ) {
            return [ivlJoin(leftRowIvl, rightRowIvl), leftColIvl];
        }
        return undefined;
    }

    function exceptRect2D(
        [leftRowIvl, leftColIvl]: Rect2D,
        [rightRowIvl, rightColIvl]: Rect2D,
    ): Rect2D | undefined {
        const rowCmp = ivlCompare(leftRowIvl, rightRowIvl);
        const colCmp = ivlCompare(leftColIvl, rightColIvl);

        if (rowCmp !== undefined && rowCmp <= 0) {
            const newCols = ivlExcept(leftColIvl, rightColIvl);
            if (newCols !== undefined) { return [leftRowIvl, newCols]; }
        }

        if (colCmp !== undefined && colCmp <= 0) {
            const newRows = ivlExcept(leftRowIvl, rightRowIvl);
            if (newRows !== undefined) { return [newRows, leftColIvl]; }
        }
        return undefined;
    }

    const simpleOperations: SetOperations<Rect2D, "simple id"> = {
        split(key: Rect2D): Pair<[Rect2D, number]> {
            const [left, right] = split(key);
            return [
                [left, NaN],
                [right, NaN],
            ];
        },
        canSplit: () => true,
        meets: rect2DMeets,
        compare: rect2DCompare,
        intersect: intersectRect2D,
        union: unionRect2D,
        except: exceptRect2D,
        top,
        id: "simple id" as const,
    };

    it("Split ivl tests, trying to reach 10", () => {
        let myPair = splitIvl([0, Infinity]);
        assert.deepStrictEqual(myPair[0], [0, 1]);
        assert.deepStrictEqual(myPair[1], [1, Infinity]);

        myPair = splitIvl(myPair[1]);
        assert.deepStrictEqual(myPair[0], [1, 3]);
        assert.deepStrictEqual(myPair[1], [3, Infinity]);

        myPair = splitIvl(myPair[1]);
        assert.deepStrictEqual(myPair[0], [3, 7]);
        assert.deepStrictEqual(myPair[1], [7, Infinity]);

        myPair = splitIvl(myPair[1]);
        assert.deepStrictEqual(myPair[0], [7, 15]);
        assert.deepStrictEqual(myPair[1], [15, Infinity]);

        myPair = splitIvl(myPair[0]);
        assert.deepStrictEqual(myPair[0], [7, 11]);
        assert.deepStrictEqual(myPair[1], [11, 15]);

        myPair = splitIvl(myPair[0]);
        assert.deepStrictEqual(myPair[0], [7, 9]);
        assert.deepStrictEqual(myPair[1], [9, 11]);

        myPair = splitIvl(myPair[1]);
        assert.deepStrictEqual(myPair[0], [9, 10]);
        assert.deepStrictEqual(myPair[1], [10, 11]);
    });

    it("split tests, trying to reach 3, 3", () => {
        let myPair = split([
            [0, Infinity],
            [0, Infinity],
        ]);
        assert.deepStrictEqual(myPair[0], [
            [0, 1],
            [0, Infinity],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [1, Infinity],
            [0, Infinity],
        ]);

        myPair = split(myPair[1]);
        assert.deepStrictEqual(myPair[0], [
            [1, 3],
            [0, Infinity],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [3, Infinity],
            [0, Infinity],
        ]);

        myPair = split(myPair[1]);
        assert.deepStrictEqual(myPair[0], [
            [3, 7],
            [0, Infinity],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [7, Infinity],
            [0, Infinity],
        ]);

        myPair = split(myPair[0]);
        assert.deepStrictEqual(myPair[0], [
            [3, 5],
            [0, Infinity],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [5, 7],
            [0, Infinity],
        ]);

        myPair = split(myPair[0]);
        assert.deepStrictEqual(myPair[0], [
            [3, 4],
            [0, Infinity],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [4, 5],
            [0, Infinity],
        ]);

        myPair = split(myPair[0]);
        assert.deepStrictEqual(myPair[0], [
            [3, 4],
            [0, 1],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [3, 4],
            [1, Infinity],
        ]);

        myPair = split(myPair[1]);
        assert.deepStrictEqual(myPair[0], [
            [3, 4],
            [1, 3],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [3, 4],
            [3, Infinity],
        ]);

        myPair = split(myPair[1]);
        assert.deepStrictEqual(myPair[0], [
            [3, 4],
            [3, 7],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [3, 4],
            [7, Infinity],
        ]);

        myPair = split(myPair[0]);
        assert.deepStrictEqual(myPair[0], [
            [3, 4],
            [3, 5],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [3, 4],
            [5, 7],
        ]);

        myPair = split(myPair[0]);
        assert.deepStrictEqual(myPair[0], [
            [3, 4],
            [3, 4],
        ]);
        assert.deepStrictEqual(myPair[1], [
            [3, 4],
            [4, 5],
        ]);
    });

    it("meets repro", () => {
        assert.deepStrictEqual(ivlMeets([4, 5], [3, 6]), true);
        assert.deepStrictEqual(ivlMeets([0, Infinity], [3, 5]), true);
        assert.deepStrictEqual(
            rect2DMeets(
                [
                    [4, 5],
                    [0, Infinity],
                ],
                [
                    [3, 6],
                    [3, 5],
                ],
            ), true);
    });

    it("Build up a big set out of many small ones", () => {
        const rectangles: Rect2D[] = [];
        for (let i = 3; i < 7; i += 1) {
            for (let j = 3; j < 7; j += 1) {
                rectangles.push([
                    [i, Math.min(i + j, 7)],
                    [j, Math.max(j + 1, Math.min(i - j + 5, 7))],
                ]);
            }
        }

        function test<T>(createFromKey_inner: (key: Rect2D) => BspSet<Rect2D, T>) {
            const sets = rectangles.map(createFromKey_inner);
            const expected = createFromKey_inner([
                [3, 7],
                [3, 7],
            ]);

            for (const set of sets) {
                const cmp = compare(set, expected);
                assert.equal(cmp !== undefined && cmp < 0, true);
            }

            const actual = sets.reduce(union);

            assert.equal(compare(actual, expected), 0);
        }

        test(createFromKey(simpleOperations));
    });

    it("union repro", () => {
        const rectangles: Rect2D[] = [
            [
                [0, 1],
                [0, 2],
            ],
            [
                [1, 2],
                [0, 1],
            ],
            [
                [1, 2],
                [1, 2],
            ],
        ];
        function test<T>(createFromKey_inner: (key: Rect2D) => BspSet<Rect2D, T>) {
            const sets = rectangles.map(createFromKey_inner);
            const expected = createFromKey_inner([
                [0, 2],
                [0, 2],
            ]);

            for (const set of sets) {
                const cmp = compare(set, expected);
                assert.equal(cmp !== undefined && cmp < 0, true);
            }

            const actual = sets.reduce(union);

            assert.equal(compare(actual, expected), 0);
        }

        test(createFromKey(simpleOperations));
    });

    it("Compute a large intersection", () => {
        const rectangles: Rect2D[] = [];
        for (let i = 3; i < 7; i += 1) {
            for (let j = 3; j < 7; j += 1) {
                rectangles.push([
                    [i, Math.max(i + j, 8)],
                    [j, Math.max(8, i - j + 10)],
                ]);
            }
        }

        function test<T>(createFromKey_inner: (key: Rect2D) => BspSet<Rect2D, T>) {
            const sets = rectangles.map(createFromKey_inner);
            const expected = createFromKey_inner([
                [6, 8],
                [6, 8],
            ]);

            for (const set of sets) {
                const cmp = compare(set, expected);
                assert.equal(cmp !== undefined && cmp > 0, true);
            }

            const actual = sets.reduce(intersect);

            assert.equal(compare(actual, expected), 0);
        }

        test(createFromKey(simpleOperations));
    });

    it("Compute a large set difference", () => {
        const rectangles: Rect2D[] = [];
        for (let i = 3; i < 7; i += 1) {
            for (let j = 3; j < 7; j += 1) {
                rectangles.push([
                    [i, Math.max(8, i + j)],
                    [j + 2, Math.max(9, i - j + 10)],
                ]);
                rectangles.push([
                    [i + 2, Math.max(8, i + j)],
                    [j, Math.max(9, i - j + 10)],
                ]);
            }
        }

        function test<T>(createFromKey_inner: (key: Rect2D) => BspSet<Rect2D, T>) {
            const sets = rectangles.map(createFromKey_inner);
            const expected = createFromKey_inner([
                [3, 5],
                [3, 5],
            ]);

            for (const set of sets) {
                assert.equal(compare(set, expected), undefined);
            }

            const actual = sets.reduce(
                except,
                createFromKey_inner([
                    [3, 8],
                    [3, 8],
                ]),
            );

            assert.equal(compare(actual, expected), 0);
        }

        test(createFromKey(simpleOperations));
    });

    it("Symmetric difference", () => {
        function test<T>(createFromKey_inner: (key: Rect2D) => BspSet<Rect2D, T>) {
            const a = createFromKey_inner([
                [1, 3],
                [1, 3],
            ]);
            const b = createFromKey_inner([
                [2, 4],
                [2, 4],
            ]);

            const actual = symmetricDiff(a, b);
            const points: [number, number][] = [
                [1, 1],
                [1, 2],
                [2, 1],
                [3, 2],
                [3, 3],
                [2, 3],
            ];
            const expected = points
                .map(([x, y]) =>
                    createFromKey_inner([
                        [x, x + 1],
                        [y, y + 1],
                    ]),
                )
                .reduce(union);

            assert.equal(compare(actual, expected), 0);
        }

        test(createFromKey(simpleOperations));
    });

    it("Meets", () => {
        function test<T>(createFromKey_inner: (key: Rect2D) => BspSet<Rect2D, T>) {
            const a = createFromKey_inner([
                [1, 3],
                [1, 3],
            ]);
            const b = createFromKey_inner([
                [2, 4],
                [2, 4],
            ]);

            const actual = meets(a, b);

            assert.equal(actual, true);
        }

        test(createFromKey(simpleOperations));
    });

    it("Complement", () => {
        function test<T>(createFromKey_inner: (key: Rect2D) => BspSet<Rect2D, T>) {
            const a = createFromKey_inner([
                [1, 3],
                [1, 3],
            ]);

            const expected = except(dense, a);
            const actual = complement(a);

            assert.deepStrictEqual(actual, expected);
            assert.equal(compare(actual, expected), 0);
            assert.equal(compare(intersect(actual, a), empty), 0);

            assert.equal(complement(empty), dense);
            assert.equal(complement(dense), empty);
        }

        test(createFromKey(simpleOperations));
    });

    it("Test empty set as result", () => {
        function test<T>(createFromKey_inner: (key: Rect2D) => BspSet<Rect2D, T>) {
            const a = createFromKey_inner([
                [1, 1],
                [2, 2],
            ]);
            const b = createFromKey_inner([
                [2, 2],
                [1, 1],
            ]);

            const actual = intersect(a, b);
            assert.equal(actual, empty);
            assert.equal(compare(actual, empty), 0);
        }

        test(createFromKey(simpleOperations));
    });

    it("forEachKey", () => {
        assert.doesNotThrow(() =>
            forEachKey(empty, () => {
                throw new Error("should not be called");
            }),
        );

        function test<T>(createFromKey_inner: (key: Rect2D) => BspSet<Rect2D, T>) {
            const a = createFromKey_inner([
                [1, 3],
                [1, 3],
            ]) as Exclude<BspSet<Rect2D, T>, Dense>;
            const b = createFromKey_inner([
                [2, 4],
                [2, 4],
            ]) as Exclude<BspSet<Rect2D, T>, Dense>;
            const u = union(a, b) as Exclude<BspSet<Rect2D, T>, Dense>;

            let n = 0;
            forEachKey(a, (key) => {
                assert.deepEqual(key, [
                    [1, 3],
                    [1, 3],
                ]);
                n += 1;
                return true;
            });
            assert.equal(n, 1);

            let v: BspSet<Rect2D, T> = empty;
            n = 0;
            forEachKey(u, (key) => {
                v = union(v, createFromKey_inner(key));
                n += 1;
                return true;
            });
            assert.equal(compare(u, v), 0);
            assert.equal(n > 2, true);
        }

        test(createFromKey(simpleOperations));
    });
});
