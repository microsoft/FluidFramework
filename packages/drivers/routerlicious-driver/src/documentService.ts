/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import * as api from "@fluidframework/driver-definitions";
import { RateLimiter } from "@fluidframework/driver-utils";
import { IClient } from "@fluidframework/protocol-definitions";
import { GitManager, Historian, RestWrapper } from "@fluidframework/server-services-client";
import io from "socket.io-client";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentStorageService } from "./documentStorageService";
import { R11sDocumentDeltaConnection } from "./documentDeltaConnection";
import { NullBlobStorageService } from "./nullBlobStorageService";
import { ITokenProvider } from "./tokens";
import { RouterliciousOrdererRestWrapper, RouterliciousStorageRestWrapper } from "./restWrapper";
import { IRouterliciousDriverPolicies } from "./policies";
import { ICache } from "./cache";
import { ISnapshotTreeVersion } from "./definitions";

/**
 * Amount of time after disconnect within which we don't need to rediscover.
 * In the future, we likely want to retrieve this information from service's "inactive session" definition.
 */
const RediscoverAfterTimeDisconnectedMs = 60000; // 1 minute

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    private lastDisconnectAt: number = Date.now();
    private lastDiscoveredAt: number = Date.now();
    private discoverP: Promise<void> | undefined;

    private storageManager: GitManager | undefined;
    private noCacheStorageManager: GitManager | undefined;
    private ordererRestWrapper: RestWrapper | undefined;

    public get resolvedUrl() {
        return this._resolvedUrl;
    }

    constructor(
        private _resolvedUrl: api.IResolvedUrl,
        protected ordererUrl: string,
        private deltaStorageUrl: string,
        private storageUrl: string,
        private readonly logger: ITelemetryLogger,
        protected tokenProvider: ITokenProvider,
        protected tenantId: string,
        protected documentId: string,
        private readonly driverPolicies: IRouterliciousDriverPolicies,
        private readonly blobCache: ICache<ArrayBufferLike>,
        private readonly snapshotTreeCache: ICache<ISnapshotTreeVersion>,
        private readonly discoverFluidResolvedUrl: () => Promise<api.IFluidResolvedUrl>,
    ) {
    }

    private documentStorageService: DocumentStorageService | undefined;

    public dispose() { }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<api.IDocumentStorageService> {
        if (this.documentStorageService !== undefined) {
            return this.documentStorageService;
        }

        if (this.storageUrl === undefined) {
            return new NullBlobStorageService();
        }

        const getStorageManager = async (disableCache?: boolean): Promise<GitManager> => {
            if (!this.storageManager || !this.noCacheStorageManager || this.shouldUpdateDiscoveredSessionInfo()) {
                await this.refreshDiscovery();
                const rateLimiter = new RateLimiter(this.driverPolicies.maxConcurrentStorageRequests);
                const storageRestWrapper = await RouterliciousStorageRestWrapper.load(
                    this.tenantId,
                    this.documentId,
                    this.tokenProvider,
                    this.logger,
                    rateLimiter,
                    this.driverPolicies.enableRestLess,
                    this.storageUrl,
                );
                const historian = new Historian(
                    this.storageUrl,
                    true,
                    false,
                    storageRestWrapper);
                this.storageManager = new GitManager(historian);
                const noCacheHistorian = new Historian(
                    this.storageUrl,
                    true,
                    true,
                    storageRestWrapper);
                this.noCacheStorageManager = new GitManager(noCacheHistorian);
            }

            return disableCache ? this.noCacheStorageManager : this.storageManager;
        };
        // Initialize storageManager and noCacheStorageManager
        const storageManager = await getStorageManager();
        const noCacheStorageManager = await getStorageManager(true);
        const documentStorageServicePolicies: api.IDocumentStorageServicePolicies = {
            caching: this.driverPolicies.enablePrefetch
                ? api.LoaderCachingPolicy.Prefetch
                : api.LoaderCachingPolicy.NoCaching,
            minBlobSize: this.driverPolicies.aggregateBlobsSmallerThanBytes,
        };

        this.documentStorageService = new DocumentStorageService(
            this.documentId,
            storageManager,
            this.logger,
            documentStorageServicePolicies,
            this.driverPolicies,
            this.blobCache,
            this.snapshotTreeCache,
            noCacheStorageManager,
            getStorageManager);
        return this.documentStorageService;
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<api.IDocumentDeltaStorageService> {
        await this.connectToStorage();
        assert(!!this.documentStorageService, 0x0b1 /* "Storage service not initialized" */);

        const getRestWrapper = async (): Promise<RestWrapper> => {
            if (!this.ordererRestWrapper || this.shouldUpdateDiscoveredSessionInfo()) {
                await this.refreshDiscovery();
                const rateLimiter = new RateLimiter(this.driverPolicies.maxConcurrentOrdererRequests);
                this.ordererRestWrapper = await RouterliciousOrdererRestWrapper.load(
                    this.tenantId,
                    this.documentId,
                    this.tokenProvider,
                    this.logger,
                    rateLimiter,
                    this.driverPolicies.enableRestLess,
                );
            }
            return this.ordererRestWrapper;
        };
        const restWrapper = await getRestWrapper();
        const deltaStorageService = new DeltaStorageService(
            this.deltaStorageUrl,
            restWrapper,
            this.logger,
            getRestWrapper,
        );
        return new DocumentDeltaStorageService(
            this.tenantId,
            this.documentId,
            deltaStorageService,
            this.documentStorageService,
        );
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for routerlicious driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<api.IDocumentDeltaConnection> {
        const connect = async (refreshToken?: boolean) => {
            if (this.shouldUpdateDiscoveredSessionInfo()) {
                await this.refreshDiscovery();
            }
            const ordererToken = await this.tokenProvider.fetchOrdererToken(
                this.tenantId,
                this.documentId,
                refreshToken,
            );
            return R11sDocumentDeltaConnection.create(
                this.tenantId,
                this.documentId,
                ordererToken.jwt,
                io,
                client,
                this.ordererUrl,
                this.logger,
            );
        };

        // Attempt to establish connection.
        // Retry with new token on authorization error; otherwise, allow container layer to handle.
        let connection: api.IDocumentDeltaConnection;
        try {
            connection = await connect();
        } catch (error: any) {
            if (error?.statusCode === 401) {
                // Fetch new token and retry once,
                // otherwise 401 will be bubbled up as non-retriable AuthorizationError.
                connection = await connect(true /* refreshToken */);
            }
            throw error;
        }
        // Listen to disconnect events after successful connection to know if we need to rediscover the session.
        connection.on("disconnect", (reason: any) => {
            this.lastDisconnectAt = Date.now();
        });
        return connection;
    }

    /**
     * Re-discover session URLs if necessary.
     */
    private async refreshDiscovery(): Promise<void> {
        if (this.lastDiscoveredAt >= this.lastDisconnectAt) {
            // We already rediscovered since latest disconnect.
            return;
        }
        if (!this.discoverP) {
            this.discoverP = this.refreshDiscoveryCore();
        }
        return this.discoverP;
    }

    private async refreshDiscoveryCore(): Promise<void> {
        const fluidResolvedUrl = await this.discoverFluidResolvedUrl();
        this._resolvedUrl = fluidResolvedUrl;
        this.storageUrl = fluidResolvedUrl.endpoints.storageUrl;
        this.ordererUrl = fluidResolvedUrl.endpoints.ordererUrl;
        this.deltaStorageUrl = fluidResolvedUrl.endpoints.deltaStorageUrl;
        this.lastDiscoveredAt = Date.now();
    }

    /**
     * Whether enough time has passed since last disconnect to warrant a new discovery call on reconnect.
     */
    private shouldUpdateDiscoveredSessionInfo(): boolean {
        if (!this.driverPolicies.enableDiscovery) {
            return false;
        }
        // When connection is disconnected, we cannot know if session has moved or document has been deleted
        // without re-doing discovery on the next attempt to connect.
        // Make sure client was disconnected for a reasonably long enough time to avoid spamming discovery endpoint.
        return Date.now() - this.lastDisconnectAt > RediscoverAfterTimeDisconnectedMs;
    }
}
