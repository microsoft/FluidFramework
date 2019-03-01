import "mocha";
import { TableDocument, ITable } from "@chaincode/table-document";
import { DataStore } from "@prague/app-datastore";
import { FileSystemLoader } from "./filesystemloader";
import { createDocumentService } from "@prague/routerlicious-socket-storage";

const store = new DataStore(
    "http://localhost:3000",
    "http://localhost:3001",
    new FileSystemLoader(process.env.RUSH_ROOT),
    createDocumentService("http://localhost:3000", "http://localhost:3001"),
    "43cfc3fbf04a97c0921fd23ff10f9e4b",
    "prague",
    "anonymous-coward"
);

export function makeId(type: string) {
    const id = Math.random().toString(36).substr(2);
    console.log(`${type}: ${id}`);
    return id;
}

export async function createTable() {
    return await store.open<TableDocument>(makeId("Table-Document"), TableDocument.type, "", []);
}

export function roundtrip(slice: ITable) {
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

export function areEqual(left: ITable, right: ITable) {
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
