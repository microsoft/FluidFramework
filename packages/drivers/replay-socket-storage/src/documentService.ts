/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import { ReplayDeltaStorageService } from "./deltaStorageService";
import { ReplayDocumentDeltaConnection } from "./documentDeltaConnection";
import { ReplayDocumentStorageService } from "./replayDocumentStorageService";

/**
 * The Replay document service dummies out the snapshot and the delta storage.
 * Delta connection simulates the socket by fetching the ops from delta storage
 * and emitting them with a pre determined delay
 */
export class ReplayDocumentService implements api.IDocumentService {
    constructor(private readonly replayFrom: number,
                private readonly replayTo: number,
                private readonly documentService: api.IDocumentService,
                private readonly unitIsTime: boolean | undefined) {
    }

    /**
     * Connects to a storage endpoint for snapshot service and blobs.
     * @returns returns the dummy document storage service for replay driver.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return new ReplayDocumentStorageService();
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
        const documentDeltaStorageService: api.IDocumentDeltaStorageService =
            await this.documentService.connectToDeltaStorage();
        return ReplayDocumentDeltaConnection.create(
            documentDeltaStorageService,
            this.replayFrom,
            this.replayTo,
            this.unitIsTime);
    }

    public async branch(): Promise<string> {
        return Promise.reject("Invalid operation");
    }

    public getErrorTrackingService() {
        return null;
    }
}
