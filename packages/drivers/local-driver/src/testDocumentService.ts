/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@microsoft/fluid-driver-definitions";
import { IClient } from "@microsoft/fluid-protocol-definitions";
import * as socketStorage from "@microsoft/fluid-routerlicious-driver";
import { GitManager } from "@fluidframework/server-services-client";
import { TestHistorian } from "@fluidframework/server-test-utils";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { TestDeltaStorageService, TestDocumentDeltaConnection } from "./";

/**
 * Basic implementation of a document service for testing.
 */
export class TestDocumentService implements api.IDocumentService {
    public readonly isExperimentalDocumentService = true;
    /**
     * @param localDeltaConnectionServer - delta connection server for ops
     * @param tokenProvider - token provider with a single token
     * @param tenantId - ID of tenant
     * @param documentId - ID of document
     */
    constructor(
        public readonly resolvedUrl: api.IResolvedUrl,
        private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer,
        private readonly tokenProvider: socketStorage.TokenProvider,
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly documentDeltaConnectionsMap: Map<string, TestDocumentDeltaConnection>,
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
        const documentDeltaConnection = await TestDocumentDeltaConnection.create(
            this.tenantId,
            this.documentId,
            this.tokenProvider.token,
            client,
            this.localDeltaConnectionServer.webSocketServer);

        const clientId = documentDeltaConnection.clientId;

        // Add this document service for the clientId in the document service factory.
        this.documentDeltaConnectionsMap.set(clientId, documentDeltaConnection);

        // Add a listener to remove this document service when the client is diconnected.
        documentDeltaConnection.on("disconnect", () => {
            this.documentDeltaConnectionsMap.delete(clientId);
        });

        return documentDeltaConnection;
    }

    /**
     * Returns null
     */
    public async branch(): Promise<string> {
        throw new Error("Not implemented");
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
    resolvedUrl: api.IResolvedUrl,
    localDeltaConnectionServer: ILocalDeltaConnectionServer,
    tokenProvider: socketStorage.TokenProvider,
    tenantId: string,
    documentId: string,
    documentDeltaConnectionsMap: Map<string, TestDocumentDeltaConnection>): api.IDocumentService {
    return new TestDocumentService(
        resolvedUrl, localDeltaConnectionServer, tokenProvider, tenantId, documentId, documentDeltaConnectionsMap);
}
