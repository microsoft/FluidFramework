import { DataStore } from "@prague/datastore";
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

describe("LocalTestDataStore", () => {
    before(() => {
        testDeltaConnectionServer = TestDeltaConnectionServer.Create();
        testLoader = new TestLoader([
            [TestComponent.type, { instantiate: () => Promise.resolve(DataStore.instantiate(new TestComponent())) }],
        ]);
    });

    it("open", async () => {
        const datastore = new DataStore(
            testLoader,
            createTestDocumentService(testDeltaConnectionServer),
            "tokenKey",
            "tenantId");

        const doc = await datastore.open<TestComponent>("documentId", "userId", TestComponent.type);
        assert.equal(doc.count, 0);

        doc.increment();
        assert.equal(doc.count, 1);

        doc.set("done1");
    });

    it("open 2", async () => {
        const datastore = new DataStore(
            testLoader,
            createTestDocumentService(testDeltaConnectionServer),
            "tokenKey",
            "tenantId");

        const doc = await datastore.open<TestComponent>("documentId", "userId", TestComponent.type);
        await doc.wait("done1");
        console.log("sync compoleted");
        assert.equal(doc.count, 1);

        doc.increment();
        assert.equal(doc.count, 2);
    });

    after(async () => {
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
