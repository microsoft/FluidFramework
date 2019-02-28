import { TableDocument, ITable } from "@chaincode/table-document";
import { DataStore } from "@prague/app-datastore";
import { createDocumentService } from "@prague/routerlicious-socket-storage";
import { FileSystemLoader } from "./filesystemloader";
import * as process from "process";

function makeId(type: string) {
    const id = Math.random().toString(36).substr(2);
    console.log(`${type}: ${id}`);
    return id;
}

function roundtrip(slice: ITable) {
    for (let row = 0; row < slice.numRows; row++) {
        for (let col = 0; col < slice.numCols; col++) {
            slice.setCellText(row, col, `${row},${col}`);
        }    
    }

    for (let row = 0; row < slice.numRows; row++) {
        let s = "";
        for (let col = 0; col < slice.numCols; col++) {
            s = `${s}${slice.getCellText(row, col)} `;
        }
        console.log(s);
    }
}

function areEqual(left: ITable, right: ITable) {
    if (left.numRows != right.numRows && left.numCols != right.numCols) {
        return false;
    }

    for (let row = 0; row < left.numRows; row++) {
        for (let col = 0; col < left.numCols; col++) {
            if (left.getCellText(row, col) !== right.getCellText(row, col)) {
                return false;
            }
        }
    }

    return true;
}

async function main() {
    const store = new DataStore(
        "http://localhost:3000",
        "http://localhost:3001",
        new FileSystemLoader(process.env.RUSH_ROOT),
        createDocumentService("http://localhost:3000", "http://localhost:3001"),
        "43cfc3fbf04a97c0921fd23ff10f9e4b",
        "prague",
        "anonymous-coward"
    );

    const table = await store.open<TableDocument>(makeId("Table-Document"), TableDocument.type, "", []);
    table.setCellText(0, 0, "=0/0");

    const slice1 = await table.createSlice(makeId("Table-Slice-1"), "unnamed", 0, 0, 2, 2);
    roundtrip(slice1);

    const slice2 = await table.createSlice(makeId("Table-Slice-2"), "unnamed2", 0, 0, 2, 2);
    console.log(areEqual(slice1, slice2));

    slice1.setCellText(0, 0, "=0/1");
    console.log(slice2.evaluateCell(0, 0));         // -> "0"
    console.log(slice2.evaluateFormula("=A1"));     // -> "0"
}

main();
