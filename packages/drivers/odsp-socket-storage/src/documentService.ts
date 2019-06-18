/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import * as io from "socket.io-client";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentStorageService } from "./documentStorageService";
import { NoopDocumentStorageManager } from "./noopDocumentStorageManager";
import { StandardDocumentStorageManager } from "./standardDocumentStorageManager";
import { TokenProvider } from "./token";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    constructor(
        private readonly snapshotUrl: string,
        private readonly deltaStorageUrl: string,
        private readonly webSocketUrl: string,
        private readonly tokenProvider: TokenProvider,
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly bypassSnapshot = false,
        ) {
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for legacy odsp driver.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        const documentManager = this.bypassSnapshot ?
            new NoopDocumentStorageManager() :
            new StandardDocumentStorageManager(this.documentId, this.snapshotUrl, this.tokenProvider);
        return new DocumentStorageService(documentManager);
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for legacy odsp driver.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        const deltaStorage = new DeltaStorageService(this.deltaStorageUrl);
        return new DocumentDeltaStorageService(this.tenantId, this.documentId, this.tokenProvider, deltaStorage);
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for legacy odsp driver.
     */
    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return DocumentDeltaConnection.create(this.tenantId, this.documentId, this.tokenProvider.socketToken, io, client, this.webSocketUrl);
    }

    public branch(): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public getErrorTrackingService(): null {
        return null;
    }
}
