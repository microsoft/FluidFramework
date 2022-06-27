/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    createFromProduct,
    intersectProduct,
    compareProduct,
    unionProduct,
    exceptProduct,
    complementProduct,
    symmetricDiffProduct,
    project,
    forEachProduct,
    meetsProduct,
} from "../productSet";
import { createFromKey, empty, dense } from "../bspSet";
import { Ivl, boundedParetoSetOperations } from "../split";

describe("Product-set tests", () => {
    const anyValue: Ivl = [0, 1000];

    interface Rect2D { xDim: Ivl; yDim: Ivl; }

    const createBsp = createFromKey(
        boundedParetoSetOperations(1, anyValue[0] + 1, anyValue[1], anyValue, "Interval operations" as const),
    );

    const toProd = ({ xDim, yDim }: Rect2D) => createFromProduct({ xDim: createBsp(xDim), yDim: createBsp(yDim) });

    it("Build up a big set out of many small ones", () => {
        const expected = toProd({ xDim: [3, 7], yDim: [3, 7] });
        const rectangles: Rect2D[] = [];
        for (let i = 3; i < 7; i += 1) {
            for (let j = 3; j < 7; j += 1) {
                rectangles.push({
                    xDim: [i, Math.min(i + j, 7)],
                    yDim: [j, Math.max(j + 1, Math.min(i - j + 5, 7))],
                });
            }
        }

        const sets = rectangles.map(toProd);

        for (const set of sets) {
            const cmp = compareProduct(set, expected);
            assert.equal(cmp !== undefined && cmp < 0, true);
        }

        const actual = sets.reduce(unionProduct);

        assert.equal(compareProduct(actual, expected), 0);
    });

    it("union repro", () => {
        const expected = toProd({ xDim: [0, 2] as Ivl, yDim: [0, 2] as Ivl });
        const rectangles: Rect2D[] = [
            { xDim: [0, 1], yDim: [0, 2] },
            { xDim: [1, 2], yDim: [0, 1] },
            { xDim: [1, 2], yDim: [1, 2] },
        ];
        const sets = rectangles.map(toProd);

        for (const set of sets) {
            const cmp = compareProduct(set, expected);
            assert.equal(cmp !== undefined && cmp < 0, true);
        }

        const actual = sets.reduce(unionProduct);

        assert.equal(compareProduct(actual, expected), 0);
    });

    it("Compute a large intersection", () => {
        const expected = toProd({ xDim: [6, 8], yDim: [6, 8] });
        const rectangles: Rect2D[] = [];
        for (let i = 3; i < 7; i += 1) {
            for (let j = 3; j < 7; j += 1) {
                rectangles.push({ xDim: [i, Math.max(i + j, 8)], yDim: [j, Math.max(8, i - j + 10)] });
            }
        }

        const sets = rectangles.map(toProd);

        for (const set of sets) {
            const cmp = compareProduct(set, expected);
            assert.equal(cmp !== undefined && cmp > 0, true);
        }

        const actual = sets.reduce(intersectProduct);

        assert.equal(compareProduct(actual, expected), 0);
    });

    it("Compute a large set difference", () => {
        const rectangles: Rect2D[] = [];
        for (let i = 3; i < 7; i += 1) {
            for (let j = 3; j < 7; j += 1) {
                rectangles.push({ xDim: [i, Math.max(8, i + j)], yDim: [j + 2, Math.max(9, i - j + 10)] });
                rectangles.push({ xDim: [i + 2, Math.max(8, i + j)], yDim: [j, Math.max(9, i - j + 10)] });
            }
        }

        const sets = rectangles.map(toProd);
        const expected = toProd({ xDim: [3, 5], yDim: [3, 5] });

        for (const set of sets) {
            const cmp = compareProduct(set, expected);
            assert.equal(cmp, undefined);
        }

        const actual = sets.reduce(exceptProduct, toProd({ xDim: [3, 8], yDim: [3, 8] }));

        assert.equal(compareProduct(actual, expected), 0);
    });

    it("Symmetric difference", () => {
        const a = toProd({ xDim: [1, 3], yDim: [1, 3] });
        const b = toProd({ xDim: [2, 4], yDim: [2, 4] });

        const actual = symmetricDiffProduct(a, b);
        const points: [number, number][] = [
            [1, 1],
            [1, 2],
            [2, 1],
            [3, 2],
            [3, 3],
            [2, 3],
        ];
        const expected = points.map(([x, y]) => toProd({ xDim: [x, x + 1], yDim: [y, y + 1] })).reduce(unionProduct);

        assert.equal(compareProduct(actual, expected), 0);
    });

    it("Meets", () => {
        const a = toProd({ xDim: [1, 3], yDim: [1, 3] });
        const b = toProd({ xDim: [2, 4], yDim: [2, 4] });

        const actual = meetsProduct(a, b);

        assert.equal(actual, true);
    });

    it("Complement", () => {
        const a = toProd({ xDim: [1, 3], yDim: [1, 3] });

        const expected = exceptProduct(dense, a);
        const actual = complementProduct(a);

        assert.deepStrictEqual(actual, expected);
        assert.equal(compareProduct(actual, expected), 0);
        assert.equal(compareProduct(intersectProduct(actual, a), empty), 0);

        assert.equal(complementProduct(empty), dense);
        assert.equal(complementProduct(dense), empty);
        assert.equal(unionProduct(a, actual), dense);
    });

    it("Test empty set as result", () => {
        const a = toProd({ xDim: [1, 1], yDim: [2, 2] });
        const b = toProd({ xDim: [2, 2], yDim: [1, 1] });

        const actual = intersectProduct(a, b);
        assert.equal(actual, empty);
        assert.equal(compareProduct(actual, empty), 0);
    });

    it("Test cartesian product", () => {
        const a = createFromProduct({ xDim: createBsp([1, 4]) });
        const b = createFromProduct({ yDim: createBsp([2, 3]) });

        const expected = toProd({ xDim: [1, 4], yDim: [2, 3] });
        const actual = intersectProduct(a, b);
        assert.deepStrictEqual(actual, expected);

        assert.equal(compareProduct(actual, expected), 0);
    });

    it("Test multi-dimensional union", () => {
        const a = createFromProduct({ xDim: createBsp([1, 4]) });
        const b = createFromProduct({ yDim: createBsp([2, 3]) });

        const expected = unionProduct(toProd({ xDim: [1, 4], yDim: anyValue }),
            toProd({ xDim: anyValue, yDim: [2, 3] }));
        const actual = unionProduct(a, b);
        assert.deepStrictEqual(actual, expected);

        assert.equal(compareProduct(actual, expected), 0);
    });

    it("Repro for multi-dimensional compare", () => {
        const a = createFromProduct({ xDim: createBsp([1, 4]) });
        const b = createFromProduct({ yDim: createBsp([2, 3]) });

        assert.equal(compareProduct(a, b), undefined);
    });

    it("Test multi-dimensional difference", () => {
        const a = createFromProduct({ xDim: createBsp([1, 4]) });
        const b = createFromProduct({ yDim: createBsp([2, 3]) });

        const expected = unionProduct(
            toProd({ xDim: [1, 4], yDim: [0, 2] }),
            toProd({ xDim: [1, 4], yDim: [3, anyValue[1]] }),
        );
        const actual = exceptProduct(a, b);

        assert.equal(compareProduct(actual, expected), 0);
    });

    it("Test projections", () => {
        const points: Rect2D[] = [];
        for (let i = 0; i < 50; i += 1) {
            points.push({ xDim: [i, i + 1], yDim: [i, i + 1] });
        }

        const diagonal = points.map(toProd).reduce(unionProduct);
        const expectedXProj = createFromProduct({ xDim: createBsp([0, 50]) });
        const expectedYProj = createFromProduct({ yDim: createBsp([0, 50]) });

        const actualXProj = project(diagonal, "xDim");
        const actualYProj = project(diagonal, "yDim");

        assert.equal(compareProduct(actualXProj, expectedXProj), 0);
        assert.equal(compareProduct(actualYProj, expectedYProj), 0);
    });

    it("Test for-each", () => {
        assert.doesNotThrow(() =>
            forEachProduct(empty, () => {
                throw new Error("should not be called");
            }),
        );

        let n = 0;
        forEachProduct(
            dense as ReturnType<typeof toProd>,
            (p) => {
                assert.deepStrictEqual(p, { xDim: dense, yDim: dense });
                n += 1;
                return true;
            },
            "xDim",
            "yDim",
        );
        assert.equal(n, 1);

        const u = unionProduct(
            unionProduct(toProd({ xDim: [5, 10], yDim: [5, 10] }), toProd({ xDim: [10, 15], yDim: [5, 10] })),
            unionProduct(toProd({ xDim: [5, 10], yDim: [10, 15] }), toProd({ xDim: [12, 17], yDim: [12, 17] })),
        );

        n = 0;
        forEachProduct(u, (p) => {
            assert.deepStrictEqual(p, {});
            n += 1;
            return true;
        });
        assert.equal(n, 1);

        let v: ReturnType<typeof toProd> = empty;
        n = 0;
        forEachProduct(
            u,
            (p) => {
                v = unionProduct(v, createFromProduct(p));
                n += 1;
                return true;
            },
            "xDim",
            "yDim",
        );
        assert.equal(compareProduct(u, v), 0);
        assert.equal(n >= 2, true);
    });
});
