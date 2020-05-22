/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import * as api from "@fluidframework/driver-definitions";
import { IClient, IErrorTrackingService } from "@fluidframework/protocol-definitions";
import { GitManager, Historian, ICredentials, IGitCache } from "@fluidframework/server-services-client";
import Axios from "axios";
import * as io from "socket.io-client";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentStorageService } from "./documentStorageService";
import { R11sDocumentDeltaConnection } from "./documentDeltaConnection";
import { NullBlobStorageService } from "./nullBlobStorageService";
import { TokenProvider } from "./tokens";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    public readonly isExperimentalDocumentService = true;
    constructor(
        public readonly resolvedUrl: api.IResolvedUrl,
        protected ordererUrl: string,
        private readonly deltaStorageUrl: string,
        private readonly gitUrl: string,
        private readonly errorTracking: IErrorTrackingService,
        private readonly disableCache: boolean,
        private readonly historianApi: boolean,
        private readonly directCredentials: ICredentials | undefined,
        private readonly gitCache: IGitCache | null | undefined,
        protected tokenProvider: TokenProvider,
        protected tenantId: string,
        protected documentId: string,
    ) {
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        if (this.gitUrl === undefined) {
            return new NullBlobStorageService();
        }

        // Craft credentials - either use the direct credentials (i.e. a GitHub user + PAT) - or make use of our
        // tenant token
        let credentials: ICredentials | undefined;
        if (this.directCredentials) {
            credentials = this.directCredentials;
        } else {
            credentials = {
                password: this.tokenProvider.token,
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
        if (this.gitCache) {
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

        return new DocumentStorageService(this.documentId, gitManager);
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        const deltaStorage = new DeltaStorageService(this.deltaStorageUrl);
        return new DocumentDeltaStorageService(this.tenantId, this.documentId, this.tokenProvider, deltaStorage);
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for routerlicious driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<api.IDocumentDeltaConnection> {
        return R11sDocumentDeltaConnection.create(
            this.tenantId,
            this.documentId,
            this.tokenProvider.token,
            io,
            client,
            this.ordererUrl);
    }

    public async branch(): Promise<string> {
        let headers: { Authorization: string } | null = null;
        headers = {
            Authorization: `Basic ${fromUtf8ToBase64(`${this.tenantId}:${this.tokenProvider.token}`)}`,
        };

        // eslint-disable-next-line max-len
        const result = await Axios.post<string>(`${this.ordererUrl}/documents/${this.tenantId}/${this.documentId}/forks`, { headers });
        return result.data;
    }

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}
