import "mocha";
import { TableDocument, TableSlice } from "@chaincode/table-document";
import { TestHost } from "@prague/local-test-server";

const host = new TestHost([
    [TableDocument.type, Promise.resolve(TableDocument)],
    [TableSlice.type, Promise.resolve(TableSlice)],
]);

after(async () => { await host.close(); })

export function makeId(type: string) {
    const id = Math.random().toString(36).substr(2);
    console.log(`${type}: ${id}`);
    return id;
}

export async function createTable() {
    return await host.createComponent<TableDocument>(makeId("Table-Document"), TableDocument.type);
}