/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@microsoft/fluid-driver-definitions";
import { ConnectionMode, IClient } from "@microsoft/fluid-protocol-definitions";
import { FauxDeltaStorageService } from "./fauxDeltaStorageService";
import { FauxDocumentDeltaConnection } from "./fauxDocumentDeltaConnection";
import { FauxDocumentStorageService } from "./fauxDocumentStorageService";

/**
 * The DocumentService connects to in memory endpoints for storage/socket for faux document service.
 */
export class FauxDocumentService implements api.IDocumentService {
    constructor() {
    }

    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return new FauxDocumentStorageService();
    }

    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new FauxDeltaStorageService();
    }

    /**
     * Connects to a delta stream endpoint of provided documentService to mimic a delta stream endpoint.
     * @param client - Client that connects to socket.
     * @returns returns the delta stream service.
     */
    public async connectToDeltaStream(
        client: IClient,
        mode: ConnectionMode): Promise<api.IDocumentDeltaConnection> {
        return FauxDocumentDeltaConnection.create(
            client,
            mode);
    }

    public async branch(): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public getErrorTrackingService() {
        return null;
    }
}
