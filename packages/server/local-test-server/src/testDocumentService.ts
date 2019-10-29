/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@microsoft/fluid-protocol-definitions";
import * as socketStorage from "@microsoft/fluid-routerlicious-driver";
import { GitManager } from "@microsoft/fluid-server-services-client";
import {
    TestDeltaStorageService,
    TestDocumentDeltaConnection,
    TestHistorian,
} from "@microsoft/fluid-server-test-utils";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";

/**
 * Creates and returns a document service for testing.
 * @param testDeltaConnectionServer - delta connection server for ops
 * @param tokenProvider - token provider with a single token
 * @param tenantId - ID of tenant
 * @param documentId - ID of document
 */
export function createTestDocumentService(
    testDeltaConnectionServer: ITestDeltaConnectionServer,
    tokenProvider: socketStorage.TokenProvider,
    tenantId: string,
    documentId: string): api.IDocumentService {
        return new TestDocumentService(testDeltaConnectionServer, tokenProvider, tenantId, documentId);
}

/**
 * Basic implementation of a document service for testing.
 */
export class TestDocumentService implements api.IDocumentService {
    /**
     * @param testDeltaConnectionServer - delta connection server for ops
     * @param tokenProvider - token provider with a single token
     * @param tenantId - ID of tenant
     * @param documentId - ID of document
     */
    constructor(
        private testDeltaConnectionServer: ITestDeltaConnectionServer,
        private tokenProvider: socketStorage.TokenProvider,
        private tenantId: string,
        private documentId: string,
    ) {}

    /**
     * Creates and returns a document storage service for testing.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return new socketStorage.DocumentStorageService(this.documentId,
            new GitManager(new TestHistorian(this.testDeltaConnectionServer.testDbFactory.testDatabase)));
    }

    /**
     * Creates and returns a delta storage service for testing.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new TestDeltaStorageService(
            this.tenantId,
            this.documentId,
            this.testDeltaConnectionServer.databaseManager);
    }

    /**
     * Creates and returns a delta stream for testing.
     * @param client - client data
     */
    public async connectToDeltaStream(
            client: api.IClient,
            mode: api.ConnectionMode,
            callback: (connection: api.IDocumentDeltaConnection) => void): Promise<void> {
        // socketStorage.DocumentDeltaStorageService?
        return TestDocumentDeltaConnection.create(
            this.tenantId,
            this.documentId,
            this.tokenProvider.token,
            client,
            this.testDeltaConnectionServer.webSocketServer,
            mode,
            callback);
    }

    /**
     * Returns null
     */
    public async branch(): Promise<string> {
        return null;
    }

    /**
     * Returns null
     */
    public getErrorTrackingService(): any {
        return null;
    }
}
