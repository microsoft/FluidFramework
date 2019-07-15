/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import { TestDeltaStorageService, TestDocumentDeltaConnection, TestDocumentStorageService } from "@prague/test-utils";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";

export function createTestDocumentService(
    testDeltaConnectionServer: ITestDeltaConnectionServer,
    tokenProvider: socketStorage.TokenProvider,
    tenantId: string,
    documentId: string): api.IDocumentService {
        return new TestDocumentService(testDeltaConnectionServer, tokenProvider, tenantId, documentId);
}

export class TestDocumentService implements api.IDocumentService {
    constructor(
        private testDeltaConnectionServer: ITestDeltaConnectionServer,
        private tokenProvider: socketStorage.TokenProvider,
        private tenantId: string,
        private documentId: string,
    ) {}

    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new TestDeltaStorageService(
            this.tenantId,
            this.documentId,
            this.testDeltaConnectionServer.databaseManager);
    }

    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        // socketStorage.DocumentDeltaStorageService?
        return TestDocumentDeltaConnection.create(
            this.tenantId,
            this.documentId,
            this.tokenProvider.token,
            client,
            this.testDeltaConnectionServer.webSocketServer);
    }

    public async branch(): Promise<string> {
        return null;
    }

    public getErrorTrackingService() {
        return null;
    }
}
