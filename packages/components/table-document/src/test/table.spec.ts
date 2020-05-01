/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-shadow */

import * as assert from "assert";
import { TestHost } from "@microsoft/fluid-local-test-utils";
import { TableDocument } from "../document";
import { TableSlice } from "../slice";
import { TableDocumentType } from "../componentTypes";
import { TableDocumentItem } from "../table";

describe("TableDocument", () => {
    let host: TestHost;

    before(() => {
        host = new TestHost([
            [TableDocumentType, Promise.resolve(TableDocument.getFactory())],
        ]);
    });

    after(async () => { await host.close(); });

    function makeId(type: string) {
        const id = Math.random().toString(36).substr(2);
        // console.log(`${type}: ${id}`);
        return id;
    }

    const createTable = async () => host.createAndAttachComponent(makeId(TableDocumentType), TableDocumentType);

    let table: TableDocument;
    beforeEach(async () => {
        table = await createTable() as TableDocument;
    });

    const extract = (table: TableDocument) => {
        const rows: TableDocumentItem[][] = [];
        for (let r = 0; r < table.numRows; r++) {
            const cols: TableDocumentItem[] = [];
            for (let c = 0; c < table.numCols; c++) {
                cols.push(table.getCellValue(r, c));
            }
            rows.push(cols);
        }
        return rows;
    };

    const expect = async (expected: readonly (readonly any[])[]) => {
        assert.strictEqual(table.numRows, expected.length);
        assert.deepStrictEqual(extract(table), expected);

        // Paranoid check that awaiting incoming messages does not change test results.
        // (Typically, only catches bugs w/TestHost).
        await TestHost.sync(host);
        assert.strictEqual(table.numRows, expected.length);
        assert.deepStrictEqual(extract(table), expected);
    };

    it("Initially empty", async () => {
        await expect([]);
        assert.throws(() => table.getCellValue(0, 0));
    });

    it("Insert row", async () => {
        table.insertRows(0, 1);
        await expect([[]]);
    });

    it("Insert col", async () => {
        table.insertRows(0, 1);
        table.insertCols(0, 1);
        await expect([[undefined]]);
    });

    describe("local get/set", () => {
        // GitHub Issue #1683 - Cannot roundtrip non-finite numbers.
        for (const value of ["", "string", 0 /* , -Infinity, +Infinity */]) {
            it(`roundtrip ${JSON.stringify(value)}`, async () => {
                table.insertRows(0, 1);
                table.insertCols(0, 1);
                table.setCellValue(0, 0, value);
                await expect([[value]]);
            });
        }

        // GitHub Issue #1683 - Cannot roundtrip non-finite numbers.
        // it(`roundtrip NaN`, () => {
        //     table.setCellText(0, 0, NaN);
        //     assert(isNaN(table.getCellValue(0, 0) as number));
        // });

        it(`all cells`, async () => {
            for (let row = 0; row < table.numRows; row++) {
                for (let col = 0; col < table.numCols; col++) {
                    table.setCellValue(row, col, `${row},${col}`);
                }
            }

            for (let row = 0; row < table.numRows; row++) {
                for (let col = 0; col < table.numCols; col++) {
                    assert.strictEqual(table.getCellValue(row, col), `${row},${col}`);
                }
            }
        });
    });

    describe("eval", () => {
        it("=A1", () => {
            table.insertRows(0, 1);
            table.insertCols(0, 2);
            table.setCellValue(0, 0, 10);
            table.setCellValue(0, 1, "=A1");
            assert.strictEqual(table.evaluateCell(0, 1), 10);
        });

        it("=A1 w/invalidation", () => {
            table.insertRows(0, 1);
            table.insertCols(0, 2);
            table.setCellValue(0, 0, 10);
            table.setCellValue(0, 1, "=A1");
            assert.strictEqual(table.evaluateCell(0, 1), 10);
            table.setCellValue(0, 0, 20);
            assert.strictEqual(table.evaluateCell(0, 1), 20);
        });

        it("=A1 w/insert col", () => {
            table.insertRows(0, 1);
            table.insertCols(0, 2);
            table.setCellValue(0, 0, 10);
            table.setCellValue(0, 1, "=A1");
            assert.strictEqual(table.evaluateCell(0, 1), 10);
            table.insertCols(1, 1);
            assert.strictEqual(table.evaluateCell(0, 1), undefined);
            assert.strictEqual(table.evaluateCell(0, 2), 10);
        });

        it("=A1 w/insert row", () => {
            table.insertRows(0, 1);
            table.insertCols(0, 2);
            table.setCellValue(0, 0, 10);
            table.setCellValue(0, 1, "=A1");
            assert.strictEqual(table.evaluateCell(0, 1), 10);
            table.insertRows(0, 1);
            assert.strictEqual(table.evaluateCell(0, 1), undefined);
            assert.strictEqual(table.evaluateCell(1, 1), 10);
        });

        it("cascading recalcs", () => {
            table.insertRows(0, 1);
            table.insertCols(0, 4);
            table.setCellValue(0, 1, "=A1");
            table.setCellValue(0, 2, "=B1");
            table.setCellValue(0, 3, "=C1");
            for (const expected of [10, 20, 30]) {
                table.setCellValue(0, 0, expected);
                for (let r = 0; r < table.numRows; r++) {
                    for (let c = 0; c < table.numCols; c++) {
                        assert.strictEqual(table.evaluateCell(r, c), expected);
                    }
                }
            }
        });
    });

    describe("annotations", () => {
        it("row", () => {
            table.insertRows(0, 2);
            table.insertCols(0, 1);
            table.annotateRows(0, 1, { id: "row0" });
            assert.deepEqual(table.getRowProperties(0), { id: "row0" });
            assert.strictEqual(table.getRowProperties(1), undefined);
        });

        it("col", () => {
            table.insertRows(0, 1);
            table.insertCols(0, 2);
            table.annotateCols(0, 1, { id: "col0" });
            assert.deepEqual(table.getColProperties(0), { id: "col0" });
            assert.strictEqual(table.getColProperties(1), undefined);
        });
    });

    describe("TableSlice", () => {
        it("range follows edits", async () => {
            table.insertRows(0, 5);
            table.insertCols(0, 7);
            const min = { row: 1, col: 2 };
            const max = { row: 3, col: 4 };

            table.setCellValue(min.row, min.col, "start");
            table.setCellValue(max.row, max.col, "end");

            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice",
                min.row, min.col, max.row, max.col);
            assert.strictEqual(slice.getCellValue(min.row, min.col), "start");
            assert.strictEqual(slice.getCellValue(max.row, max.col), "end");

            table.setCellValue(min.row, min.col, "min");
            table.setCellValue(max.row, max.col, "max");
            assert.strictEqual(slice.getCellValue(min.row, min.col), "min");
            assert.strictEqual(slice.getCellValue(max.row, max.col), "max");
        });

        it("asserts when outside of slice", async () => {
            table.insertRows(0, 5);
            table.insertCols(0, 7);

            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 0, 0, 2, 2);
            assert.throws(() => slice.getCellValue(-1, 0));
            assert.throws(() => slice.getCellValue(3, 0));
            assert.throws(() => slice.getCellValue(0, -1));
            assert.throws(() => slice.getCellValue(0, 3));
        });

        it("Annotations work when proxied through table slice", async () => {
            table.insertRows(0, 5);
            table.insertCols(0, 7);

            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 0, 0, 2, 2);
            slice.annotateRows(0, 1, { id: "row0" });
            assert.deepEqual(slice.getRowProperties(0), { id: "row0" });
            assert.strictEqual(slice.getRowProperties(1), undefined);

            slice.annotateRows(2, 3, { id: "row1" });
            assert.deepEqual(slice.getRowProperties(2), { id: "row1" });
        });

        it("Insert rows and columns work when proxied through table slice", async () => {
            table.insertRows(0, 5);
            table.insertCols(0, 7);

            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 0, 0, 2, 2);
            assert.equal(slice.numCols, 3);
            assert.equal(slice.numRows, 3);

            slice.insertCols(1, 2);
            assert.equal(slice.numCols, 5);
            slice.insertRows(1, 2);
            assert.equal(slice.numRows, 5);
        });
    });

    describe("CellRange", () => {
        it("forEachRowMajor visits all cells", async () => {
            table.insertRows(0, 5);
            table.insertCols(0, 7);

            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 1, 1, 2, 2);
            assert.equal(slice.numCols, 2);
            assert.equal(slice.numRows, 2);

            const visited: string[] = [];
            (slice as TableSlice).values.forEachRowMajor((row, col) => {
                visited.push(`${row},${col}`);
                return true;
            });

            assert.deepStrictEqual(visited, ["1,1", "1,2", "2,1", "2,2"]);
        });

        it("forEachColMajor visits all cells", async () => {
            table.insertRows(0, 5);
            table.insertCols(0, 7);

            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 1, 1, 2, 2);
            assert.equal(slice.numCols, 2);
            assert.equal(slice.numRows, 2);

            const visited: string[] = [];
            (slice as TableSlice).values.forEachColMajor((row, col) => {
                visited.push(`${row},${col}`);
                return true;
            });

            assert.deepStrictEqual(visited, ["1,1", "2,1", "1,2", "2,2"]);
        });
    });
});
