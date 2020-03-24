/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@microsoft/fluid-driver-definitions";
import { IClient } from "@microsoft/fluid-protocol-definitions";
import * as socketStorage from "@microsoft/fluid-routerlicious-driver";
import { GitManager } from "@microsoft/fluid-server-services-client";
import { TestHistorian } from "@microsoft/fluid-server-test-utils";
import { ILocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { TestDeltaStorageService, TestDocumentDeltaConnection } from "./";

/**
 * Basic implementation of a document service for testing.
 */
export class TestDocumentService implements api.IDocumentService {
    /**
     * @param localDeltaConnectionServer - delta connection server for ops
     * @param tokenProvider - token provider with a single token
     * @param tenantId - ID of tenant
     * @param documentId - ID of document
     */
    constructor(
        private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer,
        private readonly tokenProvider: socketStorage.TokenProvider,
        private readonly tenantId: string,
        private readonly documentId: string,
    ) { }

    /**
     * Creates and returns a document storage service for testing.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return new socketStorage.DocumentStorageService(this.documentId,
            new GitManager(new TestHistorian(this.localDeltaConnectionServer.testDbFactory.testDatabase)));
    }

    /**
     * Creates and returns a delta storage service for testing.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new TestDeltaStorageService(
            this.tenantId,
            this.documentId,
            this.localDeltaConnectionServer.databaseManager);
    }

    /**
     * Creates and returns a delta stream for testing.
     * @param client - client data
     */
    public async connectToDeltaStream(
        client: IClient): Promise<api.IDocumentDeltaConnection> {
        return TestDocumentDeltaConnection.create(
            this.tenantId,
            this.documentId,
            this.tokenProvider.token,
            client,
            this.localDeltaConnectionServer.webSocketServer);
    }

    /**
     * Returns null
     */
    public async branch(): Promise<string> {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    /**
     * Returns null
     */
    public getErrorTrackingService(): any {
        // eslint-disable-next-line no-null/no-null
        return null;
    }
}

/**
 * Creates and returns a document service for testing.
 * @param localDeltaConnectionServer - delta connection server for ops
 * @param tokenProvider - token provider with a single token
 * @param tenantId - ID of tenant
 * @param documentId - ID of document
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function createTestDocumentService(
    localDeltaConnectionServer: ILocalDeltaConnectionServer,
    tokenProvider: socketStorage.TokenProvider,
    tenantId: string,
    documentId: string): api.IDocumentService {
    return new TestDocumentService(localDeltaConnectionServer, tokenProvider, tenantId, documentId);
}
