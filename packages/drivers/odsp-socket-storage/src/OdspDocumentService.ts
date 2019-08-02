/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@prague/gitresources";
import * as api from "@prague/protocol-definitions";
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import * as io from "socket.io-client";
import { ISocketStorageDiscovery } from "./contracts";
import { IFetchWrapper } from "./fetchWrapper";
import { DocumentDeltaStorageService, OdspDeltaStorageService } from "./OdspDeltaStorageService";
import { IOdspSnapshot } from "./OdspDocumentServiceFactory";
import { OdspDocumentStorageManager } from "./OdspDocumentStorageManager";
import { OdspDocumentStorageService } from "./OdspDocumentStorageService";
import { TokenProvider } from "./tokenProvider";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService implements api.IDocumentService {
    private attemptedDeltaStreamConnection: boolean;
    private readonly joinSessionP: SinglePromise<ISocketStorageDiscovery> | undefined;
    private tokenProvider: TokenProvider;

    /**
     * @param appId - app id used for telemetry for network requests
     * @param storageFetchWrapper - if not provided FetchWrapper will be used
     * @param deltasFetchWrapper - if not provided FetchWrapper will be used
     * @param socketStorageDiscovery - the initial JoinSession response
     * @param snapshotP - optional promise to prefetched latest snapshot. It will query the
     * server if the promise is not provide. If the promise resolves to null,
     * it will assume that there are no snapshot on the server and skip the query
     * @param joinSession - function to invoke to re-run JoinSession
     */
    constructor(
        private readonly appId: string,
        private readonly storageFetchWrapper: IFetchWrapper,
        private readonly deltasFetchWrapper: IFetchWrapper,
        private socketStorageDiscovery: ISocketStorageDiscovery,
        private readonly snapshotP?: Promise<IOdspSnapshot | undefined>,
        joinSession?: () => Promise<ISocketStorageDiscovery>,
    ) {
        this.attemptedDeltaStreamConnection = false;

        if (joinSession) {
            this.joinSessionP = new SinglePromise(joinSession);
        }

        this.tokenProvider = new TokenProvider(socketStorageDiscovery.storageToken, socketStorageDiscovery.socketToken);
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for sharepoint driver.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        let blobs: resources.IBlob[] | undefined;
        let trees: resources.ITree[] | undefined;
        let latestSha: string | null | undefined;
        if (this.snapshotP) {
            const snapshot = await this.snapshotP;
            if (snapshot) {
                trees = snapshot.trees;
                latestSha = snapshot.sha;
                blobs = snapshot.blobs;
            } else {
                // Use null to indicate latest snapshot doesn't not exist
                latestSha = null;
            }
        }

        return new OdspDocumentStorageService(
            new OdspDocumentStorageManager(
                { app_id: this.appId },
                this.socketStorageDiscovery.id,
                this.socketStorageDiscovery.snapshotStorageUrl,
                latestSha,
                trees,
                blobs,
                this.storageFetchWrapper,
                async (refresh) => {
                    if (refresh) {
                        await this.refreshKnowledge();
                    }

                    return this.tokenProvider;
                },
            ),
        );
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for sharepoint driver.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        const snapshot = await this.snapshotP;
        const ops = snapshot ? snapshot.ops || [] : undefined;

        return new DocumentDeltaStorageService(
            this.socketStorageDiscovery.tenantId,
            this.socketStorageDiscovery.id,
            this.tokenProvider,
            new OdspDeltaStorageService(
                { app_id: this.appId },
                this.socketStorageDiscovery.deltaStorageUrl,
                this.deltasFetchWrapper,
                ops,
                async (refresh) => {
                    if (refresh) {
                        await this.refreshKnowledge();
                    }

                    if (!this.tokenProvider.storageToken) {
                        throw new Error("unexpected missing storageToken upon refresh attempt!");
                    }

                    return this.tokenProvider;
                },
            ),
        );
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for sharepoint driver.
     */
    public async connectToDeltaStream(client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        // TODO: we should add protection to ensure we are only ever processing one connectToDeltaStream

        // when it's not the first time through it means we are trying to reconnect to a disconnected websocket.
        // In this scenario we should refresh our knowledge before attempting to connect
        if (this.attemptedDeltaStreamConnection) {
            await this.refreshKnowledge();
        }

        this.attemptedDeltaStreamConnection = true;

        return DocumentDeltaConnection.create(
            this.socketStorageDiscovery.tenantId,
            this.socketStorageDiscovery.id,
            this.tokenProvider.socketToken,
            io,
            client,
            this.socketStorageDiscovery.deltaStreamSocketUrl);
    }

    public async branch(): Promise<string> {
        return "";
    }

    public getErrorTrackingService(): api.IErrorTrackingService {
        return { track: () => null };
    }

    private async refreshKnowledge(): Promise<void> {
        if (this.joinSessionP) {
            this.socketStorageDiscovery = await this.joinSessionP.response;
            this.tokenProvider = new TokenProvider(
                this.socketStorageDiscovery.storageToken,
                this.socketStorageDiscovery.socketToken,
            );
        }
    }
}

class SinglePromise<T> {
    private pResponse: Promise<T> | undefined;
    private active: boolean;
    constructor(private readonly fn: () => Promise<T>) {
        this.active = false;
    }

    public get response(): Promise<T> {
        // if we are actively running and we have a response return it
        if (this.active && this.pResponse) {
            return this.pResponse;
        }

        this.active = true;
        this.pResponse = this.fn()
            .then((response) => {
                this.active = false;
                return response;
            })
            .catch((e) => {
                this.active = false;
                return Promise.reject(e);
            });

        return this.pResponse;
    }
}
