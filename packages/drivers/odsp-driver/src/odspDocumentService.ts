/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { performance, TelemetryNullLogger } from "@fluidframework/common-utils";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IResolvedUrl,
    IDocumentStorageService,
} from "@fluidframework/driver-definitions";
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
import { debug } from "./debug";
import { IOdspCache, startingUpdateUsageOpFrequency, updateUsageOpMultiplier } from "./odspCache";
import { OdspDeltaStorageService } from "./odspDeltaStorageService";
import { OdspDocumentDeltaConnection } from "./odspDocumentDeltaConnection";
import { OdspDocumentStorageService } from "./odspDocumentStorageManager";
import { getWithRetryForTokenRefresh, isLocalStorageAvailable } from "./odspUtils";
import { fetchJoinSession } from "./vroom";
import { isOdcOrigin } from "./odspUrlHelper";
import { TokenFetchOptions } from "./tokenFetch";

const afdUrlConnectExpirationMs = 6 * 60 * 60 * 1000; // 6 hours
const lastAfdConnectionTimeMsKey = "LastAfdConnectionTimeMs";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService implements IDocumentService {
    protected updateUsageOpFrequency = startingUpdateUsageOpFrequency;

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
    ): Promise<IDocumentService> {
        return new OdspDocumentService(
            resolvedUrl as IOdspResolvedUrl,
            getStorageToken,
            getWebsocketToken,
            logger,
            socketIoClientFactory,
            cache,
            hostPolicy,
        );
    }

    private storageManager?: OdspDocumentStorageService;

    private readonly logger: TelemetryLogger;

    private readonly localStorageAvailable: boolean;

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
    ) {
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

        this.localStorageAvailable = isLocalStorageAvailable();
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

        const res = new OdspDeltaStorageService(
            urlProvider,
            this.storageManager?.ops,
            this.getStorageToken,
            this.logger,
        );

        return {
            get: async (from?: number, to?: number) => {
                const ops = await res.get(from, to);
                this.opsReceived(ops);
                return ops;
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
            // For ODC, we just use the token from joinsession
            const socketTokenPromise = this.isOdc ? Promise.resolve("") : this.getWebsocketToken(options);
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

            try {
                const connection = await this.connectToDeltaStreamWithRetry(
                    websocketEndpoint.tenantId,
                    websocketEndpoint.id,
                    webSocketToken,
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
                throw error;
            }
        });
    }

    public async branch(): Promise<string> {
        return "";
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
            );

        // Note: The sessionCache is configured with a sliding expiry of 1 hour,
        // so if we've fetched the join session within the last hour we won't run executeFetch again now.
        return this.cache.sessionJoinCache.addOrGet(this.joinSessionKey, executeFetch);
    }

    /**
     * Safely tries to write to local storage
     * Returns false if writing to localStorage fails. True otherwise
     *
     * @param key - localStorage key
     * @returns whether or not the write succeeded
     */
    private writeLocalStorage(key: string, value: string) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            debug(`Could not write to localStorage due to ${e}`);
            return false;
        }
    }

    /**
     * Test if we deal with NetworkErrorBasic object and if it has enough information to make a call
     * If in doubt, allow retries
     *
     * @param error - error object
     */
    private canRetryOnError(error: any) {
        // Always retry unless told otherwise.
        return error === null || typeof error !== "object" || error.canRetry === undefined || error.canRetry;
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
     * @param url - websocket URL
     * @param url2 - alternate websocket URL
     */
    private async connectToDeltaStreamWithRetry(
        tenantId: string,
        documentId: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string,
        url2?: string): Promise<IDocumentDeltaConnection> {
        const hasUrl2 = !!url2;

        // Create null logger if telemetry logger is not available from caller
        const logger = this.logger ? this.logger : new TelemetryNullLogger();

        let afdCacheValid = false;

        if (this.localStorageAvailable) {
            const lastAfdConnection = localStorage.getItem(lastAfdConnectionTimeMsKey);
            if (lastAfdConnection !== null) {
                const lastAfdTimeMs = Number(lastAfdConnection);
                // If we have used the AFD URL within a certain amount of time in the past,
                // then we should use it again.
                if (!isNaN(lastAfdTimeMs) && lastAfdTimeMs > 0
                    && Date.now() - lastAfdTimeMs <= afdUrlConnectExpirationMs) {
                    afdCacheValid = true;
                } else {
                    localStorage.removeItem(lastAfdConnectionTimeMsKey);
                }
            }
        }

        // Use AFD URL if in cache
        if (afdCacheValid && hasUrl2) {
            debug("Connecting to AFD URL directly due to valid cache.");
            const startAfd = performance.now();

            return OdspDocumentDeltaConnection.create(
                tenantId,
                documentId,
                token,
                io,
                client,
                url2!,
                20000,
                this.logger,
            ).then((connection) => {
                logger.sendTelemetryEvent({
                    eventName: "UsedAfdUrl",
                    fromCache: true,
                });

                return connection;
            }).catch(async (connectionError) => {
                const endAfd = performance.now();
                localStorage.removeItem(lastAfdConnectionTimeMsKey);
                // Retry on non-AFD URL
                if (this.canRetryOnError(connectionError)) {
                    // eslint-disable-next-line max-len
                    debug(`Socket connection error on AFD URL (cached). Error was [${connectionError}]. Retry on non-AFD URL: ${url}`);

                    return OdspDocumentDeltaConnection.create(
                        tenantId,
                        documentId,
                        token,
                        io,
                        client,
                        url,
                        20000,
                        this.logger,
                    ).then((connection) => {
                        logger.sendPerformanceEvent({
                            eventName: "UsedNonAfdUrlFallback",
                            duration: endAfd - startAfd,
                        }, connectionError);

                        return connection;
                    }).catch((retryError) => {
                        logger.sendPerformanceEvent({
                            eventName: "FailedNonAfdUrlFallback",
                            duration: endAfd - startAfd,
                        }, retryError);
                        throw retryError;
                    });
                } else {
                    logger.sendPerformanceEvent({
                        eventName: "FailedAfdUrl-NoNonAfdFallback",
                    }, connectionError);
                }
                throw connectionError;
            });
        }

        const startNonAfd = performance.now();
        return OdspDocumentDeltaConnection.create(
            tenantId,
            documentId,
            token,
            io,
            client,
            url,
            hasUrl2 ? 15000 : 20000,
            this.logger,
        ).then((connection) => {
            logger.sendTelemetryEvent({ eventName: "UsedNonAfdUrl" });
            return connection;
        }).catch(async (connectionError) => {
            const endNonAfd = performance.now();
            if (hasUrl2 && this.canRetryOnError(connectionError)) {
                // eslint-disable-next-line max-len
                debug(`Socket connection error on non-AFD URL. Error was [${connectionError}]. Retry on AFD URL: ${url2}`);

                return OdspDocumentDeltaConnection.create(
                    tenantId,
                    documentId,
                    token,
                    io,
                    client,
                    url2!,
                    20000,
                    this.logger,
                ).then((connection) => {
                    // Refresh AFD cache
                    const cacheResult = this.writeLocalStorage(lastAfdConnectionTimeMsKey, Date.now().toString());
                    if (cacheResult) {
                        // eslint-disable-next-line max-len
                        debug(`Cached AFD connection time. Expiring in ${new Date(Number(localStorage.getItem(lastAfdConnectionTimeMsKey)) + afdUrlConnectExpirationMs)}`);
                    }
                    logger.sendPerformanceEvent({
                        eventName: "UsedAfdUrl",
                        duration: endNonAfd - startNonAfd,
                        refreshedCache: cacheResult,
                        fromCache: false,
                    }, connectionError);

                    return connection;
                }).catch((retryError) => {
                    logger.sendPerformanceEvent({
                        eventName: "FailedAfdUrlFallback",
                        duration: endNonAfd - startNonAfd,
                    }, retryError);
                    throw retryError;
                });
            } else {
                logger.sendPerformanceEvent({
                    eventName: "FailedNonAfdUrl-NoAfdFallback",
                }, connectionError);
            }
            throw connectionError;
        });
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
