import "mocha";
import { TableDocument } from "@chaincode/table-document";
// import { DataStore } from "@prague/app-datastore";
// import { createDocumentService } from "@prague/routerlicious-socket-storage";
// import { FileSystemLoader } from "./filesystemloader";
// import * as process from "process";
import { createTable } from "./helper";
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
                let s = "";
                for (let col = 0; col < table.numCols; col++) {
                    s = `${s}${table.getCellValue(row, col)} `;
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
            table.annotateRows(0, 1, { id: "col0" });
            assert.deepEqual(table.getRowProperties(0), { id: "col0" });
            assert.strictEqual(table.getRowProperties(1), undefined);
        });
    })

    describe("TableSlice", () => {
        // GitHub Issue #1709 - LocalReference offset resolution appears to be incorrect during unit tests
        // it("range follows edits", async () => {
        //     table.setCellValue(0, 0, "start");
        //     table.setCellValue(2, 2, "end");

        //     const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 0, 0, 2, 2);
        //     assert.strictEqual(slice.getCellValue(0, 0), "start");
        //     assert.strictEqual(slice.getCellValue(2, 2), "end");

        //     table.setCellValue(0, 0, "min");
        //     table.setCellValue(2, 2, "max");
        //     assert.strictEqual(slice.getCellValue(0, 0), "min");
        //     assert.strictEqual(slice.getCellValue(2, 2), "max");
        // });

        // it("asserts when outside of slice", async () => {
        //     const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 0, 0, 2, 2);
        //     assert.throws(() => slice.getCellValue(-1, 0));
        //     assert.throws(() => slice.getCellValue(3, 0));
        //     assert.throws(() => slice.getCellValue(0, -1));
        //     assert.throws(() => slice.getCellValue(0, 3));
        // });
    });
});