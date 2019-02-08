// import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import * as assert from "assert";
import {
    createTestDocumentService,
    TestDeltaConnectionServer,
    TestLoader,
} from "..";
import { ITestDeltaConnectionServer } from "../testDeltaConnectionServer";
import { TestComponent } from "./testComponent";

let testLoader: TestLoader;
let testDeltaConnectionServer: ITestDeltaConnectionServer;

describe.skip("LocalTestDataStore", () => {
    it("open 2 Documents", async () => {
        testDeltaConnectionServer = TestDeltaConnectionServer.Create();
        testLoader = new TestLoader([
            // TODO fix
            // [TestComponent.type, { instantiate: async () => Component.instantiate(new TestComponent()) }],
        ]);
        const datastore1 = new DataStore(
            testLoader,
            createTestDocumentService(testDeltaConnectionServer),
            "tokenKey",
            "tenantId");
        const doc1 = await datastore1.open<TestComponent>("documentId", "userId", TestComponent.type);
        assert.equal(doc1.count, 0, "Incorrect count in Doc1");

        doc1.increment();
        assert.equal(doc1.count, 1, "Incorrect count in Doc1 after increment");

        doc1.set("done1");
        const datastore2 = new DataStore(
            testLoader,
            createTestDocumentService(testDeltaConnectionServer),
            "tokenKey",
            "tenantId");

        // TODO: this line is hanging after using a test web socket in LocalNode.
        const doc2 = await datastore2.open<TestComponent>("documentId", "userId", TestComponent.type);
        await doc2.wait("done1");
        console.log("sync completed");
        assert.equal(doc2.count, 1, "Incorrect count in Doc2");

        doc2.increment();
        assert.equal(doc2.count, 2, "Incorrect count in Doc2 after increment");
        doc1.close();
        doc2.close();

     });

    after(async () => {
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
