/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@microsoft/fluid-driver-definitions";
import { ConnectionMode, IClient } from "@microsoft/fluid-protocol-definitions";
import { CreationDeltaStorageService } from "./creationDeltaStorageService";
import { CreationDocumentDeltaConnection } from "./creationDocumentDeltaConnection";
import { CreationDocumentStorageService } from "./creationDocumentStorageService";
import { CreationServerMessagesHandler } from "./creationDriverServer";

/**
 * The DocumentService connects to in memory endpoints for storage/socket for faux document service.
 */
export class CreationDocumentService implements api.IDocumentService {

    private readonly creationServer: CreationServerMessagesHandler;
    constructor(
        private readonly documentId: string,
        private readonly tenantId: string) {
        this.creationServer = CreationServerMessagesHandler.getInstance(this.documentId);
    }

    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return new CreationDocumentStorageService();
    }

    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new CreationDeltaStorageService(this.creationServer);
    }

    /**
     * Connects to a delta stream endpoint of provided documentService to mimic a delta stream endpoint.
     * @param client - Client that connects to socket.
     * @returns returns the delta stream service.
     */
    public async connectToDeltaStream(
        client: IClient,
        mode?: ConnectionMode): Promise<api.IDocumentDeltaConnection> {
        // Backward compat
        if (mode !== undefined) {
            client.mode = mode;
        }
        return new CreationDocumentDeltaConnection(client, this.documentId, this.tenantId, this.creationServer);
    }

    public async branch(): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public getErrorTrackingService() {
        return null;
    }
}
