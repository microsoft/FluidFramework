import { FlowDocument } from "@chaincode/flow-document";
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { TestLoader, createTestDocumentService, TestDeltaConnectionServer } from "@prague/local-test-server";

export const TestStore = new DataStore(
    new TestLoader([
        [FlowDocument.type, { instantiate: () => Promise.resolve(Component.instantiate(new FlowDocument())) }]
    ]),
    createTestDocumentService(TestDeltaConnectionServer.Create()),
    "tokenKey",
    "tenantId");
