/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import { IReplayController } from "./replayController";
import { ReplayDeltaStorageService } from "./replayDeltaStorageService";
import { ReplayDocumentDeltaConnection } from "./replayDocumentDeltaConnection";
import { ReplayDocumentStorageService } from "./replayDocumentStorageService";

/**
 * The Replay document service dummies out the snapshot and the delta storage.
 * Delta connection simulates the socket by fetching the ops from delta storage
 * and emitting them with a pre determined delay
 */
export class ReplayDocumentService implements api.IDocumentService {
    constructor(private readonly documentService: api.IDocumentService,
                private readonly controller: IReplayController) {
    }

    /**
     * Connects to a storage endpoint for snapshot service and blobs.
     * @returns returns the dummy document storage service for replay driver.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        const documentService = await this.documentService.connectToStorage();
        return new ReplayDocumentStorageService(documentService, this.controller);
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     * @returns returns the dummy document delta storage service for replay driver.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new ReplayDeltaStorageService();
    }

    /**
     * Connects to a delta storage endpoint of provided documentService to get ops and then replaying
     * them so as to mimic a delta stream endpoint.
     * @param client - Client that connects to socket.
     * @returns returns the delta stream service which replay ops from --from to --to arguments.
     */
    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        const documentStorageService = await this.documentService.connectToDeltaStorage();
        return ReplayDocumentDeltaConnection.create(
            documentStorageService,
            this.controller);
    }

    public async branch(): Promise<string> {
        return Promise.reject("Invalid operation");
    }

    public getErrorTrackingService() {
        return null;
    }
}
