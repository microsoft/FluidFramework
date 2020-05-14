/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@microsoft/fluid-driver-definitions";
import { IClient, NackErrorType } from "@microsoft/fluid-protocol-definitions";
import * as socketStorage from "@microsoft/fluid-routerlicious-driver";
import { GitManager } from "@microsoft/fluid-server-services-client";
import { TestHistorian } from "@microsoft/fluid-server-test-utils";
import { ILocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { TestDeltaStorageService, TestDocumentDeltaConnection, TestDocumentServiceFactory } from "./";

/**
 * Basic implementation of a document service for testing.
 */
export class TestDocumentService implements api.IDocumentService {
    public readonly isExperimentalDocumentService = true;
    private documentDeltaConnection: TestDocumentDeltaConnection | undefined;
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
        private readonly documentServiceFactory: TestDocumentServiceFactory,
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
        this.documentDeltaConnection = await TestDocumentDeltaConnection.create(
            this.tenantId,
            this.documentId,
            this.tokenProvider.token,
            client,
            this.localDeltaConnectionServer.webSocketServer);

        const clientId = this.documentDeltaConnection.clientId;

        // Add this document service for the clientId in the document service factory.
        this.documentServiceFactory.addDocumentServiceClientId(clientId, this);

        // Add a listener to remove this document service when the client is diconnected.
        this.documentDeltaConnection.on("disconnect", () => {
            this.documentServiceFactory.removeDocumentServiceClientId(clientId);
        });
        return this.documentDeltaConnection;
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

    /**
     * Send a "disconnect" message on the client's socket.
     * @param disconnectReason - The reason of the disconnection.
     */
    public disconnectClient(disconnectReason): void {
        if (this.documentDeltaConnection === undefined) {
            throw new Error("Document delta connection has not been yet connected");
        }
        this.documentDeltaConnection.disconnectClient(disconnectReason);
    }

    /**
     * Send a "nack" message on the client's socket.
     * @param code - An error code number that represents the error. It will be a valid HTTP error code.
     * @param type - Type of the Nack.
     * @param message - A message about the nack for debugging/logging/telemetry purposes.
     */
    public nackClient(code?: number, type?: NackErrorType, message?: any) {
        if (this.documentDeltaConnection === undefined) {
            throw new Error("Document delta connection has not been yet connected");
        }
        this.documentDeltaConnection.nackClient(code, type, message);
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
    documentServiceFactory: TestDocumentServiceFactory): api.IDocumentService {
    return new TestDocumentService(
        resolvedUrl, localDeltaConnectionServer, tokenProvider, tenantId, documentId, documentServiceFactory);
}
