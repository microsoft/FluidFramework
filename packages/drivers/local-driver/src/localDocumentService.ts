/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import * as socketStorage from "@fluidframework/routerlicious-driver";
import { GitManager } from "@fluidframework/server-services-client";
import { TestHistorian } from "@fluidframework/server-test-utils";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { LocalDeltaStorageService, LocalDocumentDeltaConnection } from ".";

/**
 * Basic implementation of a document service for local use.
 */
export class LocalDocumentService implements api.IDocumentService {
    /**
     * @param localDeltaConnectionServer - delta connection server for ops
     * @param tokenProvider - token provider
     * @param tenantId - ID of tenant
     * @param documentId - ID of document
     */
    constructor(
        public readonly resolvedUrl: api.IResolvedUrl,
        private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer,
        private readonly tokenProvider: socketStorage.ITokenProvider,
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly documentDeltaConnectionsMap: Map<string, LocalDocumentDeltaConnection>,
    ) { }

    /**
     * Creates and returns a document storage service for local use.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return new socketStorage.DocumentStorageService(this.documentId,
            new GitManager(new TestHistorian(this.localDeltaConnectionServer.testDbFactory.testDatabase)));
    }

    /**
     * Creates and returns a delta storage service for local use.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new LocalDeltaStorageService(
            this.tenantId,
            this.documentId,
            this.localDeltaConnectionServer.databaseManager);
    }

    /**
     * Creates and returns a delta stream for local use.
     * @param client - client data
     */
    public async connectToDeltaStream(
        client: IClient): Promise<api.IDocumentDeltaConnection> {
        const ordererToken = await this.tokenProvider.fetchOrdererToken();
        const documentDeltaConnection = await LocalDocumentDeltaConnection.create(
            this.tenantId,
            this.documentId,
            ordererToken.jwt,
            client,
            this.localDeltaConnectionServer.webSocketServer);

        const clientId = documentDeltaConnection.clientId;

        // Add this document service for the clientId in the document service factory.
        this.documentDeltaConnectionsMap.set(clientId, documentDeltaConnection);

        // Add a listener to remove this document service when the client is disconnected.
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
 * Creates and returns a document service for local use.
 * @param localDeltaConnectionServer - delta connection server for ops
 * @param tokenProvider - token provider with a single token
 * @param tenantId - ID of tenant
 * @param documentId - ID of document
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function createLocalDocumentService(
    resolvedUrl: api.IResolvedUrl,
    localDeltaConnectionServer: ILocalDeltaConnectionServer,
    tokenProvider: socketStorage.ITokenProvider,
    tenantId: string,
    documentId: string,
    documentDeltaConnectionsMap: Map<string, LocalDocumentDeltaConnection>): api.IDocumentService {
    return new LocalDocumentService(
        resolvedUrl, localDeltaConnectionServer, tokenProvider, tenantId, documentId, documentDeltaConnectionsMap);
}
