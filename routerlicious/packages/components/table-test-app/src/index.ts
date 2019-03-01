import "mocha";
import { TableDocument } from "@chaincode/table-document";
// import { DataStore } from "@prague/app-datastore";
// import { createDocumentService } from "@prague/routerlicious-socket-storage";
// import { FileSystemLoader } from "./filesystemloader";
// import * as process from "process";
import { createTable, makeId } from "./helper";
import * as assert from "assert";

describe("TableDocument", () => {
    let table: TableDocument;    
    beforeEach(async () => { table = await createTable(); });
    afterEach(async () => { await table.close(); });

    it(`"Uninitialized cell is empty string"`, () => {
        assert.strictEqual(table.getCellText(0, 0), "");
    });

    describe("get/set", () => {
        for (const value of ["", "string", 0, -Infinity, +Infinity]) {
            it(`roundtrip ${JSON.stringify(value)}`, () => {
                table.setCellText(0, 0, value);
                assert.strictEqual(table.getCellText(0, 0), value);
            });
        }

        it(`roundtrip NaN`, () => {
            table.setCellText(0, 0, NaN);
            assert(isNaN(table.getCellText(0, 0) as number));
        });
    });

    it("eval", () => {
        table.setCellText(0, 0, 10);
        table.setCellText(0, 1, "=A1");
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
        it("range follows edits", async () => {
            table.setCellText(0, 0, "start");
            table.setCellText(2, 2, "end");

            const slice = await table.createSlice(makeId("Table-Slice"), "unnamed-slice", 0, 0, 2, 2);
            assert.strictEqual(slice.getCellText(0, 0), "start");
            assert.strictEqual(slice.getCellText(2, 2), "end");

            table.setCellText(0, 0, "min");
            table.setCellText(2, 2, "max");
            assert.strictEqual(slice.getCellText(0, 0), "min");
            assert.strictEqual(slice.getCellText(2, 2), "max");
        });
    });
});