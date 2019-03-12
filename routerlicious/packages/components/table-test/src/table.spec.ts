import "mocha";
import { TableDocument } from "@chaincode/table-document";
import { createTable, makeId } from "./helper";
import * as assert from "assert";

describe("TableDocument", () => {
    let table: TableDocument;    
    beforeEach(async () => { table = await createTable(); });
    afterEach(async () => { await table.close(); });

    it(`"Uninitialized cell is empty string"`, () => {
        assert.strictEqual(table.getCellValue(0, 0), "");
    });

    describe("local get/set", () => {
        // GitHub Issue #1683 - Cannot roundtrip non-finite numbers.
        for (const value of ["", "string", 0 /*, -Infinity, +Infinity */]) {
            it(`roundtrip ${JSON.stringify(value)}`, () => {
                table.setCellValue(0, 0, value);
                assert.strictEqual(table.getCellValue(0, 0), value);
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

    it("eval", () => {
        table.setCellValue(0, 0, 10);
        table.setCellValue(0, 1, "=A1");
        assert.strictEqual(table.evaluateCell(0, 1), 10);
    });

    describe("annotations", () => {
        it("row", () => {
            table.annotateRows(0, 1, { id: "row0" });
            assert.deepEqual(table.getRowProperties(0), { id: "row0" });
            assert.strictEqual(table.getRowProperties(1), undefined);
        });

        it("col", () => {
            table.annotateCols(0, 1, { id: "col0" });
            assert.deepEqual(table.getColProperties(0), { id: "col0" });
            assert.strictEqual(table.getColProperties(1), undefined);
        });
    });

    describe("TableSlice", () => {
        it("range follows edits", async () => {
            const min = { row: 1, col: 2 };
            const max = { row: 3, col: 4 };

            table.setCellValue(min.row, min.col, "start");
            table.setCellValue(max.row, max.col, "end");

            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", min.row, min.col, max.row, max.col);
            assert.strictEqual(slice.getCellValue(min.row, min.col), "start");
            assert.strictEqual(slice.getCellValue(max.row, max.col), "end");

            table.setCellValue(min.row, min.col, "min");
            table.setCellValue(max.row, max.col, "max");
            assert.strictEqual(slice.getCellValue(min.row, min.col), "min");
            assert.strictEqual(slice.getCellValue(max.row, max.col), "max");
        });

        it("asserts when outside of slice", async () => {
            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 0, 0, 2, 2);
            assert.throws(() => slice.getCellValue(-1, 0));
            assert.throws(() => slice.getCellValue(3, 0));
            assert.throws(() => slice.getCellValue(0, -1));
            assert.throws(() => slice.getCellValue(0, 3));
        });

        it("Annotations work when proxied through table slice", async () => {
            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 0, 0, 2, 2);
            slice.annotateRows(0, 1, { id: "row0" });
            assert.deepEqual(slice.getRowProperties(0), { id: "row0" });
            assert.strictEqual(slice.getRowProperties(1), undefined);

            slice.annotateRows(2, 3, { id: "row1" });
            assert.deepEqual(slice.getRowProperties(2), { id: "row1" });
        });
    });
});