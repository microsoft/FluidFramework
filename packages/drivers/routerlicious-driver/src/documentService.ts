/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import * as api from "@fluidframework/driver-definitions";
import { IClient, IErrorTrackingService } from "@fluidframework/protocol-definitions";
import { GitManager, Historian, ICredentials, IGitCache } from "@fluidframework/server-services-client";
import io from "socket.io-client";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentStorageService } from "./documentStorageService";
import { R11sDocumentDeltaConnection } from "./documentDeltaConnection";
import { NullBlobStorageService } from "./nullBlobStorageService";
import { ITokenProvider } from "./tokens";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    constructor(
        public readonly resolvedUrl: api.IResolvedUrl,
        protected ordererUrl: string,
        private readonly deltaStorageUrl: string,
        private readonly gitUrl: string,
        private readonly errorTracking: IErrorTrackingService,
        private readonly disableCache: boolean,
        private readonly historianApi: boolean,
        private readonly directCredentials: ICredentials | undefined,
        private readonly gitCache: IGitCache | undefined,
        protected tokenProvider: ITokenProvider,
        protected tenantId: string,
        protected documentId: string,
    ) {
    }

    private documentStorageService: DocumentStorageService | undefined;

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        if (this.gitUrl === undefined) {
            return new NullBlobStorageService();
        }

        const storageToken = await this.tokenProvider.fetchStorageToken();
        // Craft credentials - either use the direct credentials (i.e. a GitHub user + PAT) - or make use of our
        // tenant token
        let credentials: ICredentials | undefined;
        if (this.directCredentials) {
            credentials = this.directCredentials;
        } else {
            credentials = {
                password: storageToken.jwt,
                user: this.tenantId,
            };
        }

        const historian = new Historian(
            this.gitUrl,
            this.historianApi,
            this.disableCache,
            credentials);
        const gitManager = new GitManager(historian);

        // Insert cached seed data
        if (this.gitCache !== undefined) {
            for (const ref of Object.keys(this.gitCache.refs)) {
                gitManager.addRef(ref, this.gitCache.refs[ref]);
            }

            for (const commit of this.gitCache.commits) {
                gitManager.addCommit(commit);
            }

            for (const tree of this.gitCache.trees) {
                gitManager.addTree(tree);
            }

            for (const blob of this.gitCache.blobs) {
                gitManager.addBlob(blob);
            }
        }

        this.documentStorageService = new DocumentStorageService(this.documentId, gitManager);
        return this.documentStorageService;
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        assert(this.documentStorageService, "Storage service not initialized");

        const deltaStorage = new DeltaStorageService(this.deltaStorageUrl, this.tokenProvider);
        return new DocumentDeltaStorageService(this.tenantId, this.documentId,
            deltaStorage, this.documentStorageService);
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for routerlicious driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<api.IDocumentDeltaConnection> {
        const ordererToken = await this.tokenProvider.fetchOrdererToken();
        return R11sDocumentDeltaConnection.create(
            this.tenantId,
            this.documentId,
            ordererToken.jwt,
            io,
            client,
            this.ordererUrl);
    }

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}
