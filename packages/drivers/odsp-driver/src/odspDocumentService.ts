/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, performance } from "@fluidframework/common-utils";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import {
    LoaderCachingPolicy,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IResolvedUrl,
    IDocumentStorageService,
    IDocumentServicePolicies,
} from "@fluidframework/driver-definitions";
import { canRetryOnError } from "@fluidframework/driver-utils";
import { fetchTokenErrorCode, throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import {
    IClient,
    IErrorTrackingService,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import {
    IOdspResolvedUrl,
    HostStoragePolicy,
    HostStoragePolicyInternal,
    ISocketStorageDiscovery,
} from "./contracts";
import { IOdspCache, startingUpdateUsageOpFrequency, updateUsageOpMultiplier } from "./odspCache";
import { OdspDeltaStorageService } from "./odspDeltaStorageService";
import { OdspDocumentDeltaConnection } from "./odspDocumentDeltaConnection";
import { OdspDocumentStorageService } from "./odspDocumentStorageManager";
import { getWithRetryForTokenRefresh, isLocalStorageAvailable } from "./odspUtils";
import { fetchJoinSession } from "./vroom";
import { isOdcOrigin } from "./odspUrlHelper";
import { TokenFetchOptions } from "./tokenFetch";
import { EpochTracker } from "./epochTracker";

const afdUrlConnectExpirationMs = 6 * 60 * 60 * 1000; // 6 hours
const lastAfdConnectionTimeMsKey = "LastAfdConnectionTimeMs";

const localStorageAvailable = isLocalStorageAvailable();

/**
 * Helper to check the timestamp in localStorage (if available) indicating whether the cache is still valid.
 */
function isAfdCacheValid(): boolean {
    if (localStorageAvailable) {
        const lastAfdConnection = localStorage.getItem(lastAfdConnectionTimeMsKey);
        if (lastAfdConnection !== null) {
            const lastAfdTimeMs = Number(lastAfdConnection);
            // If we have used the AFD URL within a certain amount of time in the past,
            // then we should use it again.
            if (!isNaN(lastAfdTimeMs) && lastAfdTimeMs > 0
                && Date.now() - lastAfdTimeMs <= afdUrlConnectExpirationMs) {
                return true;
            } else {
                localStorage.removeItem(lastAfdConnectionTimeMsKey);
            }
        }
    }

    return false;
}

/**
 * Clear the AfdCache
 */
function clearAfdCache() {
    if (localStorageAvailable) {
        localStorage.removeItem(lastAfdConnectionTimeMsKey);
    }
}

/**
 * Safely tries to write to local storage
 * Returns false if writing to localStorage fails. True otherwise
 *
 * @param key - localStorage key
 * @returns whether or not the write succeeded
 */
function writeLocalStorage(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService implements IDocumentService {
    protected updateUsageOpFrequency = startingUpdateUsageOpFrequency;

    readonly policies: IDocumentServicePolicies;

    /**
     * @param getStorageToken - function that can provide the storage token. This is is also referred to as
     * the "VROOM" token in SPO.
     * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
     * referred to as the "Push" token in SPO.
     * @param logger - a logger that can capture performance and diagnostic information
     * @param socketIoClientFactory - A factory that returns a promise to the socket io library required by the driver
     * @param cache - This caches response for joinSession.
     */
    public static async create(
        resolvedUrl: IResolvedUrl,
        getStorageToken: (options: TokenFetchOptions, name?: string) => Promise<string | null>,
        getWebsocketToken: (options: TokenFetchOptions) => Promise<string | null>,
        logger: ITelemetryLogger,
        socketIoClientFactory: () => Promise<SocketIOClientStatic>,
        cache: IOdspCache,
        hostPolicy: HostStoragePolicy,
        epochTracker: EpochTracker,
    ): Promise<IDocumentService> {
        return new OdspDocumentService(
            resolvedUrl as IOdspResolvedUrl,
            getStorageToken,
            getWebsocketToken,
            logger,
            socketIoClientFactory,
            cache,
            hostPolicy,
            epochTracker,
        );
    }

    private storageManager?: OdspDocumentStorageService;

    private readonly logger: TelemetryLogger;

    private readonly joinSessionKey: string;

    private readonly isOdc: boolean;

    // Track maximum sequence number we observed and communicated to cache layer.
    private opSeqNumberMax = 0;
    private opSeqNumberMaxHostNotified = 0;

    private readonly hostPolicy: HostStoragePolicyInternal;

    /**
     * @param getStorageToken - function that can provide the storage token. This is is also referred to as
     * the "VROOM" token in SPO.
     * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also referred
     * to as the "Push" token in SPO.
     * @param logger - a logger that can capture performance and diagnostic information
     * @param socketIoClientFactory - A factory that returns a promise to the socket io library required by the driver
     * @param cache - This caches response for joinSession.
     */
    constructor(
        public readonly odspResolvedUrl: IOdspResolvedUrl,
        private readonly getStorageToken: (options: TokenFetchOptions, name?: string) => Promise<string | null>,
        private readonly getWebsocketToken: (options: TokenFetchOptions) => Promise<string | null>,
        logger: ITelemetryLogger,
        private readonly socketIoClientFactory: () => Promise<SocketIOClientStatic>,
        private readonly cache: IOdspCache,
        hostPolicy: HostStoragePolicy,
        private readonly epochTracker: EpochTracker,
    ) {
        this.policies = {
            // By default, ODSP tells the container not to prefetch/cache.
            caching: LoaderCachingPolicy.NoCaching,
            // load in storage-only mode if a file version is specified
            storageOnly: odspResolvedUrl.fileVersion !== undefined,
        };

        epochTracker.fileEntry = {
            resolvedUrl: odspResolvedUrl,
            docId: odspResolvedUrl.hashedDocumentId,
        };
        this.joinSessionKey = `${this.odspResolvedUrl.hashedDocumentId}/joinsession`;
        this.isOdc = isOdcOrigin(new URL(this.odspResolvedUrl.endpoints.snapshotStorageUrl).origin);
        this.logger = ChildLogger.create(logger,
            undefined,
            {
                odc: this.isOdc,
            });

        this.hostPolicy = hostPolicy;
        if (this.odspResolvedUrl.summarizer) {
            this.hostPolicy = cloneDeep(this.hostPolicy);
            this.hostPolicy.summarizerClient = true;
        }
    }

    public get resolvedUrl(): IResolvedUrl {
        return this.odspResolvedUrl;
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for sharepoint driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        if (!this.storageManager) {
            this.storageManager = new OdspDocumentStorageService(
                this.odspResolvedUrl,
                this.getStorageToken,
                this.logger,
                true,
                this.cache,
                this.hostPolicy,
                this.epochTracker,
            );
        }

        return this.storageManager;
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for sharepoint driver.
     */
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        const urlProvider = async () => {
            const websocketEndpoint = await this.joinSession();
            return websocketEndpoint.deltaStorageUrl;
        };

        const service = new OdspDeltaStorageService(
            urlProvider,
            this.storageManager?.ops,
            this.getStorageToken,
            this.epochTracker,
            this.logger,
        );

        return {
            get: async (from: number, to: number) => {
                const { messages, partialResult } = await service.get(from, to);
                this.opsReceived(messages);
                return { messages, partialResult };
            },
        };
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for onedrive/sharepoint driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        // Attempt to connect twice, in case we used expired token.
        return getWithRetryForTokenRefresh<IDocumentDeltaConnection>(async (options) => {
            // For ODC, we do not rely on getWebsocketToken callback and just use the token from joinsession
            const socketTokenPromise = this.isOdc ? Promise.resolve(null) : this.getWebsocketToken(options);
            const [websocketEndpoint, webSocketToken, io] =
                await Promise.all([this.joinSession(), socketTokenPromise, this.socketIoClientFactory()]);

            // This check exists because of a typescript bug.
            // Issue: https://github.com/microsoft/TypeScript/issues/33752
            // The TS team has plans to fix this in the 3.8 release
            if (!websocketEndpoint) {
                throw new Error("websocket endpoint should be defined");
            }

            // This check exists because of a typescript bug.
            // Issue: https://github.com/microsoft/TypeScript/issues/33752
            // The TS team has plans to fix this in the 3.8 release
            if (!io) {
                throw new Error("websocket endpoint should be defined");
            }

            const finalSocketToken = webSocketToken ?? (websocketEndpoint.socketToken || null);
            if (finalSocketToken === null) {
                throwOdspNetworkError("Push Token is null", fetchTokenErrorCode);
            }
            try {
                const connection = await this.connectToDeltaStreamWithRetry(
                    websocketEndpoint.tenantId,
                    websocketEndpoint.id,
                    // Accounts for ODC where websocket token is returned as part of joinsession response payload
                    finalSocketToken,
                    io,
                    client,
                    websocketEndpoint.deltaStreamSocketUrl,
                    websocketEndpoint.deltaStreamSocketUrl2);
                connection.on("op", (documentId, ops: ISequencedDocumentMessage[]) => {
                    this.opsReceived(ops);
                });
                return connection;
            } catch (error) {
                this.cache.sessionJoinCache.remove(this.joinSessionKey);
                if (typeof error === "object" && error !== null) {
                    error.socketDocumentId = websocketEndpoint.id;
                }
                throw error;
            }
        });
    }

    public getErrorTrackingService(): IErrorTrackingService {
        return { track: () => null };
    }

    private async joinSession(): Promise<ISocketStorageDiscovery> {
        const executeFetch = async () =>
            fetchJoinSession(
                this.odspResolvedUrl.driveId,
                this.odspResolvedUrl.itemId,
                this.odspResolvedUrl.siteUrl,
                "opStream/joinSession",
                "POST",
                this.logger,
                this.getStorageToken,
                this.epochTracker,
            );

        // Note: The sessionCache is configured with a sliding expiry of 1 hour,
        // so if we've fetched the join session within the last hour we won't run executeFetch again now.
        return this.cache.sessionJoinCache.addOrGet(this.joinSessionKey, executeFetch);
    }

    /**
     * Connects to a delta stream endpoint
     * If url #1 fails to connect, tries url #2 if applicable
     *
     * @param tenantId - the ID of the tenant
     * @param documentId - document ID
     * @param token - authorization token for storage service
     * @param io - websocket library
     * @param client - information about the client
     * @param nonAfdUrl - websocket URL
     * @param afdUrl - alternate websocket URL
     */
    private async connectToDeltaStreamWithRetry(
        tenantId: string,
        documentId: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        nonAfdUrl: string,
        afdUrl?: string,
    ): Promise<IDocumentDeltaConnection> {
        const connectWithNonAfd = async () => {
            const startTime = performance.now();
            // pushV2 websocket urls will contain pushf
            const pushV2 = nonAfdUrl.includes("pushf");
            try {
                const connection = await OdspDocumentDeltaConnection.create(
                    tenantId,
                    documentId,
                    token,
                    io,
                    client,
                    nonAfdUrl,
                    this.logger,
                    60000,
                    this.epochTracker,
                );
                const endTime = performance.now();
                this.logger.sendPerformanceEvent({
                    eventName: "NonAfdConnectionSuccess",
                    duration: endTime - startTime,
                    pushV2,
                });
                return connection;
            } catch (connectionError) {
                const endTime = performance.now();
                // Log before throwing
                const canRetry = canRetryOnError(connectionError);
                this.logger.sendPerformanceEvent(
                    {
                        eventName: "NonAfdConnectionFail",
                        canRetry,
                        duration: endTime - startTime,
                        pushV2,
                    },
                    connectionError,
                );
                throw connectionError;
            }
        };

        const connectWithAfd = async () => {
            assert(afdUrl !== undefined, "Tried to connect with AFD but no AFD url provided");

            const startTime = performance.now();
            try {
                const connection = await OdspDocumentDeltaConnection.create(
                    tenantId,
                    documentId,
                    token,
                    io,
                    client,
                    afdUrl,
                    this.logger,
                    60000,
                    this.epochTracker,
                );
                const endTime = performance.now();
                // Set the successful connection attempt in the cache so we can skip the non-AFD failure the next time
                // we try to connect and immediately try AFD instead.
                writeLocalStorage(lastAfdConnectionTimeMsKey, Date.now().toString());
                this.logger.sendPerformanceEvent({
                    eventName: "AfdConnectionSuccess",
                    duration: endTime - startTime,
                });
                return connection;
            } catch (connectionError) {
                const endTime = performance.now();
                // Clear cache since it failed
                clearAfdCache();
                // Log before throwing
                const canRetry = canRetryOnError(connectionError);
                this.logger.sendPerformanceEvent(
                    {
                        eventName: "AfdConnectionFail",
                        canRetry,
                        duration: endTime - startTime,
                    },
                    connectionError,
                );
                throw connectionError;
            }
        };

        const afdCacheValid = isAfdCacheValid();

        // First use the AFD URL if we've logged a successful AFD connection in the cache - its presence in the cache
        // means the non-AFD url has failed in the past, in which case we would prefer to skip doing another
        // attempt->fail on the non-AFD.
        if (afdCacheValid && afdUrl !== undefined) {
            try {
                const connection = await connectWithAfd();
                return connection;
            } catch (connectionError) {
                // Fall back to non-AFD if possible
                if (canRetryOnError(connectionError)) {
                    return connectWithNonAfd();
                }
                throw connectionError;
            }
        }

        // If we don't have a successful AFD connection in the cache, prefer connecting with non-AFD.
        try {
            const connection = await connectWithNonAfd();
            return connection;
        } catch (connectionError) {
            // Fall back to AFD if possible
            if (canRetryOnError(connectionError) && afdUrl !== undefined) {
                return connectWithAfd();
            }
            throw connectionError;
        }
    }

    // Called whenever re receive ops through any channel for this document (snapshot, delta connection, delta storage)
    // We use it to notify caching layer of how stale is snapshot stored in cache.
    protected opsReceived(ops: ISequencedDocumentMessage[]) {
        const cacheEntry = this.storageManager?.snapshotCacheEntry;
        if (ops.length === 0 || cacheEntry === undefined) {
            return;
        }

        const maxSeq = ops[ops.length - 1].sequenceNumber;
        if (this.opSeqNumberMax < maxSeq) {
            this.opSeqNumberMax = maxSeq;
        }
        if (this.opSeqNumberMaxHostNotified + this.updateUsageOpFrequency < this.opSeqNumberMax) {
            this.opSeqNumberMaxHostNotified = this.opSeqNumberMax;
            this.updateUsageOpFrequency *= updateUsageOpMultiplier;
            this.cache.persistedCache.updateUsage(cacheEntry, this.opSeqNumberMax);
        }
    }
}
