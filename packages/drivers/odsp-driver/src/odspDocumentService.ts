/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, performance } from "@fluidframework/common-utils";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IResolvedUrl,
    IDocumentStorageService,
    IDocumentServicePolicies,
} from "@fluidframework/driver-definitions";
import {
    canRetryOnError,
} from "@fluidframework/driver-utils";
import { fetchTokenErrorCode, throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import {
    IClient,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import {
    IOdspResolvedUrl,
    TokenFetchOptions,
    IEntry,
    HostStoragePolicy,
} from "@fluidframework/odsp-driver-definitions";
import { HostStoragePolicyInternal, ISocketStorageDiscovery } from "./contracts";
import { IOdspCache } from "./odspCache";
import { OdspDeltaStorageService, OdspDeltaStorageWithCache } from "./odspDeltaStorageService";
import { OdspDocumentDeltaConnection } from "./odspDocumentDeltaConnection";
import { OdspDocumentStorageService } from "./odspDocumentStorageManager";
import { getWithRetryForTokenRefresh, isLocalStorageAvailable, getOdspResolvedUrl } from "./odspUtils";
import { fetchJoinSession } from "./vroom";
import { isOdcOrigin } from "./odspUrlHelper";
import { EpochTracker } from "./epochTracker";
import { OpsCache } from "./opsCaching";

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
            // If we have used the AFD URL within a certain amount of time in the past
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
    readonly policies: IDocumentServicePolicies;

    /**
     * @param resolvedUrl - resolved url identifying document that will be managed by returned service instance.
     * @param getStorageToken - function that can provide the storage token. This is is also referred to as
     * the "Vroom" token in SPO.
     * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also referred
     * to as the "Push" token in SPO. If undefined then websocket token is expected to be returned with joinSession
     * response payload.
     * @param logger - a logger that can capture performance and diagnostic information
     * @param socketIoClientFactory - A factory that returns a promise to the socket io library required by the driver
     * @param cache - This caches response for joinSession.
     * @param hostPolicy - This host constructed policy which customizes service behavior.
     * @param epochTracker - This helper class which adds epoch to backend calls made by returned service instance.
     */
    public static async create(
        resolvedUrl: IResolvedUrl,
        getStorageToken: (options: TokenFetchOptions, name: string) => Promise<string | null>,
        getWebsocketToken: ((options: TokenFetchOptions) => Promise<string | null>) | undefined,
        logger: ITelemetryLogger,
        socketIoClientFactory: () => Promise<SocketIOClientStatic>,
        cache: IOdspCache,
        hostPolicy: HostStoragePolicy,
        epochTracker: EpochTracker,
    ): Promise<IDocumentService> {
        return new OdspDocumentService(
            getOdspResolvedUrl(resolvedUrl),
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

    private readonly hostPolicy: HostStoragePolicyInternal;

    private _opsCache?: OpsCache;

    /**
     * @param odspResolvedUrl - resolved url identifying document that will be managed by this service instance.
     * @param getStorageToken - function that can provide the storage token. This is is also referred to as
     * the "Vroom" token in SPO.
     * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also referred
     * to as the "Push" token in SPO. If undefined then websocket token is expected to be returned with joinSession
     * response payload.
     * @param logger - a logger that can capture performance and diagnostic information
     * @param socketIoClientFactory - A factory that returns a promise to the socket io library required by the driver
     * @param cache - This caches response for joinSession.
     * @param hostPolicy - This host constructed policy which customizes service behavior.
     * @param epochTracker - This helper class which adds epoch to backend calls made by this service instance.
     */
    constructor(
        public readonly odspResolvedUrl: IOdspResolvedUrl,
        private readonly getStorageToken: (options: TokenFetchOptions, name: string) => Promise<string | null>,
        private readonly getWebsocketToken: ((options: TokenFetchOptions) => Promise<string | null>) | undefined,
        logger: ITelemetryLogger,
        private readonly socketIoClientFactory: () => Promise<SocketIOClientStatic>,
        private readonly cache: IOdspCache,
        hostPolicy: HostStoragePolicy,
        private readonly epochTracker: EpochTracker,
    ) {
        this.policies = {
            // load in storage-only mode if a file version is specified
            storageOnly: odspResolvedUrl.fileVersion !== undefined,
        };

        this.joinSessionKey = `${this.odspResolvedUrl.hashedDocumentId}/joinsession`;
        this.logger = ChildLogger.create(logger,
            undefined,
            {
                all: {
                    odc: isOdcOrigin(new URL(this.odspResolvedUrl.endpoints.snapshotStorageUrl).origin),
                },
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
        const snapshotOps = this.storageManager?.ops ?? [];
        const service = new OdspDeltaStorageService(
            this.odspResolvedUrl.endpoints.deltaStorageUrl,
            this.getStorageToken,
            this.epochTracker,
            this.logger,
        );

        // batch size, please see issue #5211 for data around batch sizing
        const batchSize = this.hostPolicy.opsBatchSize ?? 5000;
        const concurrency = this.hostPolicy.concurrentOpsBatches ?? 1;

        return new OdspDeltaStorageWithCache(
            snapshotOps.map((op) => op.op),
            this.logger,
            batchSize,
            concurrency,
            async (from, to) => service.get(from, to),
            async (from, to) => {
                const res = await this.opsCache?.get(from, to);
                return res as ISequencedDocumentMessage[] ?? [];
            },
            (ops: ISequencedDocumentMessage[]) => this.opsReceived(ops),
        );
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for onedrive/sharepoint driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        // Attempt to connect twice, in case we used expired token.
        return getWithRetryForTokenRefresh<IDocumentDeltaConnection>(async (options) => {
            // Presence of getWebsocketToken callback dictates whether callback is used for fetching
            // websocket token or whether it is returned with joinSession response payload
            const requestWebsocketTokenFromJoinSession = this.getWebsocketToken === undefined;
            const websocketTokenPromise = requestWebsocketTokenFromJoinSession
                ? Promise.resolve(null)
                : this.getWebsocketToken!(options);
            const [websocketEndpoint, websocketToken, io] =
                await Promise.all([
                    this.joinSession(requestWebsocketTokenFromJoinSession),
                    websocketTokenPromise,
                    this.socketIoClientFactory(),
                ]);

            const finalWebsocketToken = websocketToken ?? (websocketEndpoint.socketToken || null);
            if (finalWebsocketToken === null) {
                throwOdspNetworkError("Push Token is null", fetchTokenErrorCode);
            }
            try {
                const connection = await this.connectToDeltaStreamWithRetry(
                    websocketEndpoint.tenantId,
                    websocketEndpoint.id,
                    finalWebsocketToken,
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

    private async joinSession(requestSocketToken: boolean): Promise<ISocketStorageDiscovery> {
        const executeFetch = async () =>
            fetchJoinSession(
                this.odspResolvedUrl,
                "opStream/joinSession",
                "POST",
                this.logger,
                this.getStorageToken,
                this.epochTracker,
                requestSocketToken,
                this.hostPolicy.sessionOptions?.unauthenticatedUserDisplayName,
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
                const duration = performance.now() - startTime;
                // This event happens rather often, so it adds up to cost of telemetry.
                // Given that most reconnects result in reusing socket and happen very quickly,
                // report event only if it took longer than threshold.
                if (duration >= 2000) {
                    this.logger.sendPerformanceEvent({
                        eventName: "NonAfdConnectionSuccess",
                        duration,
                    });
                }
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
                    },
                    connectionError,
                );
                throw connectionError;
            }
        };

        const connectWithAfd = async () => {
            assert(afdUrl !== undefined, 0x0a3 /* "Tried to connect with AFD but no AFD url provided" */);

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

    public dispose(error?: any) {
        // Error might indicate mismatch between client & server knowlege about file
        // (DriverErrorType.fileOverwrittenInStorage).
        // For exaple, file might have been overwritten in storage without generating new epoch
        // In such case client cached info is stale and has to be removed.
        if (error !== undefined) {
            this.epochTracker.removeEntries().catch(() => {});
        } else {
            this._opsCache?.flushOps();
        }
        this._opsCache?.dispose();
    }

    protected get opsCache() {
        if (this._opsCache) {
            return this._opsCache;
        }

        const seqNumber = this.storageManager?.snapshotSequenceNumber;
        const batchSize = this.hostPolicy.opsCaching?.batchSize ?? 100;
        if (seqNumber === undefined || batchSize < 1) {
            return;
        }

        const opsKey: Omit<IEntry, "key"> = {
            type: "ops",
        };
        this._opsCache = new OpsCache(
            seqNumber,
            this.logger,
            // ICache
            {
                write: async (key: string, opsData: string) => {
                    return this.cache.persistedCache.put({...opsKey, key}, opsData);
                },
                read: async (batch: string) => undefined,
                remove: () => { this.cache.persistedCache.removeEntries().catch(() => {}); },
            },
            this.hostPolicy.opsCaching?.batchSize ?? 100,
            this.hostPolicy.opsCaching?.timerGranularity ?? 5000,
            this.hostPolicy.opsCaching?.totalOpsToCache ?? 5000,
        );
        return this._opsCache;
    }

    // Called whenever re receive ops through any channel for this document (snapshot, delta connection, delta storage)
    // We use it to notify caching layer of how stale is snapshot stored in cache.
    protected opsReceived(ops: ISequencedDocumentMessage[]) {
        // No need for two clients to save same ops
        if (ops.length === 0 || this.odspResolvedUrl.summarizer) {
            return;
        }

        this.opsCache?.addOps(ops);
    }
}
