import { TableDocument } from "@chaincode/table-document";
import { DataStore } from "@prague/app-datastore";
import { createDocumentService } from "@prague/routerlicious-socket-storage";
import { FileSystemLoader } from "./filesystemloader";
import * as process from "process";

function makeId(type: string) {
    const id = Math.random().toString(36).substr(2);
    console.log(`${type}: ${id}`);
    return id;
}

async function main() {
    const tableId = makeId("Table-Document");
    const store = new DataStore(
        "http://localhost:3000",
        new FileSystemLoader(process.env.RUSH_ROOT),
        createDocumentService("http://localhost:3000", "http://localhost:3001"),
        "43cfc3fbf04a97c0921fd23ff10f9e4b",
        "prague",
        "anonymous-coward"
    );
    const table = await store.open(tableId, TableDocument.type, "", []);

    console.log(table);
}

main();
