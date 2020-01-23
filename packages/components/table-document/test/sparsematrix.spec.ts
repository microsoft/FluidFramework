/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import * as assert from "assert";
import { SparseMatrix, SparseMatrixFactory, SparseMatrixItem } from "@microsoft/fluid-sequence";
import { TestHost } from "@microsoft/fluid-local-test-server";
// eslint-disable-next-line import/no-unassigned-import
import "mocha";

describe("SparseMatrix", () => {
    const extract = (matrix: SparseMatrix, numCols: number) => {
        const rows: SparseMatrixItem[][] = [];
        for (let r = 0; r < matrix.numRows; r++) {
            const cols: SparseMatrixItem[] = [];
            for (let c = 0; c < numCols; c++) {
                cols.push(matrix.getItem(r, c));
            }
            rows.push(cols);
        }
        return rows;
    };

    describe("local client", () => {
        let host: TestHost;
        let matrix: SparseMatrix;

        before(async () => {
            host = new TestHost([], [SparseMatrix.getFactory()]);
            matrix = await host.createType("matrix", SparseMatrixFactory.Type);
        });

        const expect = async (expected: readonly (readonly any[])[]) => {
            const expectedCols = expected.length > 0
                ? expected[0].length
                : 0;

            assert.strictEqual(matrix.numRows, expected.length);
            assert.deepStrictEqual(extract(matrix, expectedCols), expected);

            // Paranoid check that awaiting incoming messages does not change test results.
            // (Typically, only catches bugs w/TestHost).
            await TestHost.sync(host);
            assert.strictEqual(matrix.numRows, expected.length);
            assert.deepStrictEqual(extract(matrix, expectedCols), expected);
        };

        after(async () => {
            await host.close();
        });

        it("initially empty", async () => {
            await expect([]);
        });

        it("append row", async () => {
            matrix.insertRows(0, 1);
            await expect([
                [undefined],
            ]);
        });

        it("set(0,0)", async () => {
            matrix.setItems(0, 0, ["BL"]);
            await expect([
                ["BL", undefined],
            ]);
        });

        it("insert 1 row", async () => {
            matrix.insertRows(0, 1);
            await expect([
                [undefined, undefined],
                ["BL", undefined],
            ]);
        });

        it("set(0,0..1),set(1,1)", async () => {
            matrix.setItems(0, 0, ["TL", "TR"]);
            matrix.setItems(1, 1, ["BR"]);
            await expect([
                ["TL", "TR", undefined],
                ["BL", "BR", undefined],
            ]);
        });

        it("insert 1 col", async () => {
            matrix.insertCols(1, 1);
            await expect([
                ["TL", undefined, "TR", undefined],
                ["BL", undefined, "BR", undefined],
            ]);
        });

        it("remove 1 col", async () => {
            matrix.removeCols(1, 1);
            await expect([
                ["TL", "TR", undefined],
                ["BL", "BR", undefined],
            ]);
        });

        it("remove 1 row", async () => {
            matrix.removeRows(0, 1);
            await expect([
                ["BL", "BR"],
            ]);
        });
    });

    describe("2 clients", () => {
        let host1: TestHost;
        let host2: TestHost;
        let matrix1: SparseMatrix;
        let matrix2: SparseMatrix;

        const print = (matrix: SparseMatrix) => {
            for (const row of extract(matrix, 10)) {
                console.log(`[${row.join(",")}]`);
            }
        };

        const assertMatrices = async (expected: readonly (readonly any[])[]) => {
            await TestHost.sync(host1, host2);
            print(matrix1);
            assert.deepStrictEqual(extract(matrix1, 10), extract(matrix2, 10));

            const expectedCols = expected.length > 0
                ? expected[0].length
                : 0;

            assert.strictEqual(matrix1.numRows, expected.length);
            assert.deepStrictEqual(extract(matrix1, expectedCols), expected);
        };

        beforeEach(async () => {
            host1 = new TestHost([], [SparseMatrix.getFactory()]);
            host2 = host1.clone();

            matrix1 = await host1.createType("matrix", SparseMatrixFactory.Type);
            matrix2 = await host2.getType("matrix");
        });

        afterEach(async () => {
            await TestHost.sync(host1, host2);
            await host1.close();
            await host2.close();
        });

        it("row insertion conflict", async () => {
            matrix1.insertRows(0, 1);
            matrix1.setItems(0, 1, [1, 2]);

            matrix2.insertRows(0, 1);
            matrix2.setItems(0, 1, ["A", "B"]);

            await assertMatrices([
                [undefined, "A", "B", undefined],
                [undefined, 1, 2, undefined],
            ]);
        });

        it("col insertion conflict", async () => {
            matrix1.insertRows(0, 1);
            matrix1.setItems(0, 0, [">", "<"]);
            await assertMatrices([
                [">", "<", undefined],
            ]);

            matrix1.insertCols(1, 1);
            matrix1.setItems(0, 1, [1]);

            matrix2.insertCols(1, 1);
            matrix2.setItems(0, 1, [2]);
            await assertMatrices([
                [">", 2, 1, "<", undefined],
            ]);
        });

        it("row/col insertion conflict", async () => {
            matrix1.insertRows(0, 1);
            matrix1.setItems(0, 0, [">", "<"]);
            await assertMatrices([
                [">", "<", undefined],
            ]);

            matrix1.insertCols(1, 1);
            matrix1.setItems(0, 1, [1]);

            matrix2.insertRows(0, 1);
            matrix2.setItems(0, 1, [2]);
            await assertMatrices([
                [undefined, 2, undefined, undefined],
                [">", 1, "<", undefined],
            ]);
        });

        it("marshalls JSON", async () => {
            // The nesting is mostly a test of the recursive Json<T> type declaration.
            const json = {
                z: null,
                b: true,
                n: 0,
                s: "s0",
                a: [null, false, 1, "s1", {
                    b: true,
                    n: 1,
                    s: "s2",
                    a: [{
                        b: false,
                        n: 2,
                        s: "s2",
                        a: [],
                        o: {},
                    }], o: {}
                }],
                o: {
                    b: false,
                    n: 3,
                    s: "s3", a: [null, false, 1, "s1", {
                        b: false,
                        n: -1,
                        s: "s2",
                        a: [{
                            b: false,
                            n: -1,
                            s: "s2",
                            a: [],
                            o: {},
                        }], o: {},
                    }],
                    o: {},
                },
            };

            const items = [null, true, -1, "s", [null, true, -1, "s"], json];

            matrix1.insertRows(0, 1);
            matrix1.insertCols(0, items.length);
            matrix1.setItems(0, 0, items);

            await assertMatrices([items]);
        });
    });
});
