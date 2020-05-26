/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    ChildLogger,
    PerformanceEvent,
    performanceNow,
    TelemetryLogger,
    TelemetryNullLogger,
} from "@fluidframework/common-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IResolvedUrl,
    IDocumentStorageService,
    IDocumentServiceFactory,
} from "@fluidframework/driver-definitions";
import {
    IClient,
    IErrorTrackingService,
    ISummaryTree,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { IOdspResolvedUrl, ISocketStorageDiscovery } from "./contracts";
import { createNewFluidFile } from "./createFile";
import { debug } from "./debug";
import { IFetchWrapper } from "./fetchWrapper";
import { IOdspCache } from "./odspCache";
import { OdspDeltaStorageService } from "./odspDeltaStorageService";
import { OdspDocumentDeltaConnection } from "./odspDocumentDeltaConnection";
import { OdspDocumentStorageManager } from "./odspDocumentStorageManager";
import { OdspDocumentStorageService } from "./odspDocumentStorageService";
import { getWithRetryForTokenRefresh, isLocalStorageAvailable, INewFileInfo } from "./odspUtils";
import { fetchJoinSession } from "./vroom";
import { isOdcOrigin } from "./odspUrlHelper";

const afdUrlConnectExpirationMs = 6 * 60 * 60 * 1000; // 6 hours
const lastAfdConnectionTimeMsKey = "LastAfdConnectionTimeMs";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService implements IDocumentService {
    public readonly isExperimentalDocumentService = true;
    /**
     * @param getStorageToken - function that can provide the storage token for a given site. This is
     * is also referred to as the "VROOM" token in SPO.
     * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
     * referred to as the "Push" token in SPO.
     * @param logger - a logger that can capture performance and diagnostic information
     * @param storageFetchWrapper - if not provided FetchWrapper will be used
     * @param deltasFetchWrapper - if not provided FetchWrapper will be used
     * @param socketIOClientP - promise to the socket io library required by the driver
     * @param cache - This caches response for joinSession.
     * @param newFileInfoPromise - promise to supply info needed to create a new file.
     */
    public static async create(
        resolvedUrl: IResolvedUrl,
        getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        getWebsocketToken: (refresh) => Promise<string | null>,
        logger: ITelemetryBaseLogger | undefined,
        storageFetchWrapper: IFetchWrapper,
        deltasFetchWrapper: IFetchWrapper,
        socketIOClientP: Promise<SocketIOClientStatic>,
        cache: IOdspCache,
        isFirstTimeDocumentOpened = true,
    ): Promise<IDocumentService> {
        let odspResolvedUrl: IOdspResolvedUrl = resolvedUrl as IOdspResolvedUrl;
        const options = odspResolvedUrl.createNewOptions;
        if (options) {
            const templogger: ITelemetryLogger = ChildLogger.create(logger, "OdspDriver");
            const event = PerformanceEvent.start(templogger,
                {
                    eventName: "CreateNew",
                    isWithSummaryUpload: false,
                });
            try {
                odspResolvedUrl = await createNewFluidFile(
                    getStorageToken,
                    await options.newFileInfoPromise,
                    cache,
                    storageFetchWrapper);
                const props = {
                    docId: odspResolvedUrl.hashedDocumentId,
                };
                event.end(props);
            } catch (error) {
                event.cancel(undefined, error);
                throw error;
            }
        }
        return new OdspDocumentService(
            odspResolvedUrl,
            getStorageToken,
            getWebsocketToken,
            logger,
            storageFetchWrapper,
            deltasFetchWrapper,
            socketIOClientP,
            cache,
            isFirstTimeDocumentOpened,
        );
    }

    public static async createContainer(
        createNewSummary: ISummaryTree,
        createNewResolvedUrl: IResolvedUrl,
        logger: ITelemetryBaseLogger | undefined,
        cache: IOdspCache,
        getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        factory: IDocumentServiceFactory,
        storageFetchWrapper: IFetchWrapper,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(createNewResolvedUrl);
        let odspResolvedUrl = createNewResolvedUrl as IOdspResolvedUrl;
        const [, queryString] = odspResolvedUrl.url.split("?");

        const searchParams = new URLSearchParams(queryString);
        const filePath = searchParams.get("path");
        if (!filePath) {
            throw new Error("File path should be provided!!");
        }
        const newFileParams: INewFileInfo = {
            driveId: odspResolvedUrl.driveId,
            siteUrl: odspResolvedUrl.siteUrl,
            filePath,
            filename: odspResolvedUrl.fileName,
        };

        const templogger: ITelemetryLogger = ChildLogger.create(logger, "OdspDriver");

        const event = PerformanceEvent.start(templogger,
            {
                eventName: "CreateNew",
                isWithSummaryUpload: true,
            });
        try {
            odspResolvedUrl = await createNewFluidFile(
                getStorageToken,
                newFileParams,
                cache,
                storageFetchWrapper,
                createNewSummary);
            const props = {
                docId: odspResolvedUrl.hashedDocumentId,
            };

            const docService = factory.createDocumentService(odspResolvedUrl, logger);
            event.end(props);
            return docService;
        } catch (error) {
            event.cancel(undefined, error);
            throw error;
        }
    }

    private storageManager?: OdspDocumentStorageManager;

    private readonly logger: TelemetryLogger;

    private readonly getStorageToken: (refresh: boolean) => Promise<string | null>;
    private readonly getWebsocketToken: (refresh) => Promise<string | null>;

    private readonly localStorageAvailable: boolean;

    private readonly joinSessionKey: string;

    private readonly isOdc: boolean;

    private opSeqNumberMin: number | undefined;
    private opSeqNumberMax: number | undefined;

    /**
     * @param getStorageToken - function that can provide the storage token for a given site. This is is also referred
     * to as the "VROOM" token in SPO.
     * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also referred
     * to as the "Push" token in SPO.
     * @param logger - a logger that can capture performance and diagnostic information
     * @param storageFetchWrapper - if not provided FetchWrapper will be used
     * @param deltasFetchWrapper - if not provided FetchWrapper will be used
     * @param socketIOClientP - promise to the socket io library required by the driver
     */
    constructor(
        public readonly odspResolvedUrl: IOdspResolvedUrl,
        getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        getWebsocketToken: (refresh) => Promise<string | null>,
        logger: ITelemetryBaseLogger | undefined,
        private readonly storageFetchWrapper: IFetchWrapper,
        private readonly deltasFetchWrapper: IFetchWrapper,
        private readonly socketIOClientP: Promise<SocketIOClientStatic>,
        private readonly cache: IOdspCache,
        private readonly isFirstTimeDocumentOpened = true,
    ) {
        this.joinSessionKey = `${this.odspResolvedUrl.hashedDocumentId}/joinsession`;
        this.isOdc = isOdcOrigin(new URL(this.odspResolvedUrl.endpoints.snapshotStorageUrl).origin);
        this.logger = ChildLogger.create(logger,
            "OdspDriver",
            {
                odc: this.isOdc,
            });

        this.getStorageToken = async (refresh: boolean, name?: string) => {
            if (refresh) {
                // Potential perf issue: Host should optimize and provide non-expired tokens on all critical paths.
                // Exceptions: race conditions around expiration, revoked tokens, host that does not care
                // (fluid-fetcher)
                this.logger.sendTelemetryEvent({ eventName: "StorageTokenRefresh" });
            }
            const event = PerformanceEvent.start(this.logger,
                { eventName: `${name || "OdspDocumentService"}_GetToken` });
            let token: string | null;
            try {
                token = await getStorageToken(this.odspResolvedUrl.siteUrl, refresh);
            } catch (error) {
                event.cancel({}, error);
                throw error;
            }
            event.end();

            return token;
        };

        this.getWebsocketToken = async (refresh) => {
            const event = PerformanceEvent.start(this.logger, { eventName: "GetWebsocketToken" });
            let token: string | null;
            try {
                token = await getWebsocketToken(refresh);
            } catch (error) {
                event.cancel({}, error);
                throw error;
            }
            event.end();

            return token;
        };

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
        const latestSha: string | null | undefined = undefined;
        this.storageManager = new OdspDocumentStorageManager(
            this.odspResolvedUrl,
            latestSha,
            this.storageFetchWrapper,
            this.getStorageToken,
            this.logger,
            true,
            this.cache,
            this.isFirstTimeDocumentOpened,
        );

        return new OdspDocumentStorageService(this.storageManager);
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
            this.deltasFetchWrapper,
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
        return getWithRetryForTokenRefresh<IDocumentDeltaConnection>(async (refresh: boolean) => {
            // For ODC, we just use the token from joinsession
            const socketTokenPromise = this.isOdc ? Promise.resolve("") : this.getWebsocketToken(refresh);
            const [websocketEndpoint, webSocketToken, io] =
                await Promise.all([this.joinSession(), socketTokenPromise, this.socketIOClientP]);

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

            return this.connectToDeltaStreamWithRetry(
                websocketEndpoint.tenantId,
                websocketEndpoint.id,
                // This is workaround for fluid-fetcher. Need to have better long term solution
                webSocketToken ? webSocketToken : websocketEndpoint.socketToken,
                io,
                client,
                websocketEndpoint.deltaStreamSocketUrl,
                websocketEndpoint.deltaStreamSocketUrl2,
            ).then((connection) => {
                connection.on("op", (documentId, ops: ISequencedDocumentMessage[]) => {
                    this.opsReceived(ops);
                });
                return connection;
            }).catch((error) => {
                this.cache.sessionJoinCache.remove(this.joinSessionKey);
                throw error;
            });
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
     * Test if we deal with NetworkError object and if it has enough information to make a call
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
     * @param id - document ID
     * @param token - authorization token for storage service
     * @param io - websocket library
     * @param client - information about the client
     * @param url - websocket URL
     * @param url2 - alternate websocket URL
     */
    private async connectToDeltaStreamWithRetry(
        tenantId: string,
        websocketId: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string,
        url2?: string): Promise<IDocumentDeltaConnection> {
        // tslint:disable-next-line: strict-boolean-expressions
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
            const startAfd = performanceNow();

            return OdspDocumentDeltaConnection.create(
                tenantId,
                websocketId,
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
                const endAfd = performanceNow();
                localStorage.removeItem(lastAfdConnectionTimeMsKey);
                // Retry on non-AFD URL
                if (this.canRetryOnError(connectionError)) {
                    // eslint-disable-next-line max-len
                    debug(`Socket connection error on AFD URL (cached). Error was [${connectionError}]. Retry on non-AFD URL: ${url}`);

                    return OdspDocumentDeltaConnection.create(
                        tenantId,
                        websocketId,
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

        const startNonAfd = performanceNow();
        return OdspDocumentDeltaConnection.create(
            tenantId,
            websocketId,
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
            const endNonAfd = performanceNow();
            if (hasUrl2 && this.canRetryOnError(connectionError)) {
                // eslint-disable-next-line max-len
                debug(`Socket connection error on non-AFD URL. Error was [${connectionError}]. Retry on AFD URL: ${url2}`);

                return OdspDocumentDeltaConnection.create(
                    tenantId,
                    websocketId,
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

    protected opsReceived(ops: ISequencedDocumentMessage[]) {
        const cacheEntry = this.storageManager?.snapshotCacheEntry;
        if (ops.length === 0 || cacheEntry === undefined) {
            return;
        }

        const minSeq = ops[0].sequenceNumber;
        if (this.opSeqNumberMin === undefined || this.opSeqNumberMin > minSeq) {
            this.opSeqNumberMin = minSeq;
        }
        const maxSeq = ops[ops.length - 1].sequenceNumber;
        if (this.opSeqNumberMax === undefined || this.opSeqNumberMax < maxSeq) {
            this.opSeqNumberMax = maxSeq;
        }
        assert(this.opSeqNumberMin < this.opSeqNumberMax);

        const origExpiry = this.storageManager!.snapshotCacheExpiry;
        const count = this.opSeqNumberMax - this.opSeqNumberMin;

        // 1K ops is close to 500K of uncompressed payload. If use use such stale snapshot, client would
        // need to download all these ops (though we can store them in cache).
        // Typical skeleton snapshot is around 12K.
        // From bandwidth optimization perspective, we would want this number to be lower
        // From latency (of first rendering) perspective, we would want this number to be higher.
        const opsTooMany = 1000;

        this.cache.persistedCache.updateExpiry(cacheEntry, origExpiry, origExpiry * (1 - count / opsTooMany));
    }
}
