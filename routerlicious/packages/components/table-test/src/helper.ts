import "mocha";
import { TableDocumentType, TableSliceType } from "@chaincode/table-document";
import { TestHost } from "@prague/local-test-server";

const host = new TestHost([
    [TableDocumentType, import("@chaincode/table-document").then((m) => m.TableDocument)],
    [TableSliceType, import("@chaincode/table-document").then((m) => m.TableSlice)],
]);

after(async () => { await host.close(); })

export function makeId(type: string) {
    const id = Math.random().toString(36).substr(2);
    console.log(`${type}: ${id}`);
    return id;
}

export async function createTable() {
    return await host.createComponent(makeId("Table-Document"), TableDocumentType);
}