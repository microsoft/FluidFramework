/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@microsoft/fluid-driver-definitions";
import { IClient } from "@microsoft/fluid-protocol-definitions";
import { EmptyDeltaStorageService } from "./emptyDeltaStorageService";
import { ReplayController } from "./replayController";
import { ReplayDocumentDeltaConnection } from "./replayDocumentDeltaConnection";

/**
 * The Replay document service dummies out the snapshot and the delta storage.
 * Delta connection simulates the socket by fetching the ops from delta storage
 * and emitting them with a pre determined delay
 */
export class ReplayDocumentService implements api.IDocumentService {
    public static async create(
        documentService: api.IDocumentService,
        controller: ReplayController): Promise<api.IDocumentService> {
        const storage = await documentService.connectToStorage();

        const useController = await controller.initStorage(storage);
        if (!useController) {
            return documentService;
        }

        const deltaConnection = ReplayDocumentDeltaConnection.create(
            await documentService.connectToDeltaStorage(),
            controller);
        return new ReplayDocumentService(controller, deltaConnection);
    }

    constructor(
        private readonly controller: api.IDocumentStorageService,
        private readonly deltaStorage: api.IDocumentDeltaConnection) {
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public get resolvedUrl(): api.IResolvedUrl {
        throw new Error("Not implemented");
    }

    /**
     * Connects to a storage endpoint for snapshot service and blobs.
     * @returns returns the dummy document storage service for replay driver.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        return this.controller;
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     * @returns returns the dummy document delta storage service for replay driver.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        return new EmptyDeltaStorageService();
    }

    /**
     * Connects to a delta storage endpoint of provided documentService to get ops and then replaying
     * them so as to mimic a delta stream endpoint.
     * @param client - Client that connects to socket.
     * @returns returns the delta stream service which replay ops from --from to --to arguments.
     */
    public async connectToDeltaStream(client: IClient): Promise<api.IDocumentDeltaConnection> {
        return this.deltaStorage;
    }

    public async branch(): Promise<string> {
        return Promise.reject("Invalid operation");
    }

    public getErrorTrackingService() {
        return null;
    }
}
