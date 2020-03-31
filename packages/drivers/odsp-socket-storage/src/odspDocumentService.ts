/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@microsoft/fluid-common-definitions";
import { DebugLogger, PerformanceEvent, TelemetryLogger, TelemetryNullLogger } from "@microsoft/fluid-common-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IResolvedUrl,
    OpenMode,
} from "@microsoft/fluid-driver-definitions";
import {
    IClient,
    IErrorTrackingService,
} from "@microsoft/fluid-protocol-definitions";
import { IOdspResolvedUrl, ISocketStorageDiscovery } from "./contracts";
import { createNewFluidFile } from "./createFile";
import { debug } from "./debug";
import { IFetchWrapper } from "./fetchWrapper";
import { IOdspCache } from "./odspCache";
import { OdspDeltaStorageService } from "./odspDeltaStorageService";
import { OdspDocumentDeltaConnection } from "./odspDocumentDeltaConnection";
import { OdspDocumentStorageManager } from "./odspDocumentStorageManager";
import { OdspDocumentStorageService } from "./odspDocumentStorageService";
import { getWithRetryForTokenRefresh, isLocalStorageAvailable } from "./odspUtils";
import { getSocketStorageDiscovery } from "./vroom";
import { isOdcOrigin } from "./odspUrlHelper";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const performanceNow = require("performance-now") as (() => number);

const afdUrlConnectExpirationMs = 6 * 60 * 60 * 1000; // 6 hours
const lastAfdConnectionTimeMsKey = "LastAfdConnectionTimeMs";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService implements IDocumentService {

    /**
     * @param appId - app id used for telemetry for network requests.
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
        appId: string,
        resolvedUrl: IResolvedUrl,
        getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        getWebsocketToken: (refresh) => Promise<string | null>,
        logger: ITelemetryBaseLogger,
        storageFetchWrapper: IFetchWrapper,
        deltasFetchWrapper: IFetchWrapper,
        socketIOClientP: Promise<SocketIOClientStatic>,
        cache: IOdspCache,
        isFirstTimeDocumentOpened = true,
    ): Promise<IDocumentService> {
        let odspResolvedUrl: IOdspResolvedUrl = resolvedUrl as IOdspResolvedUrl;
        if (odspResolvedUrl.openMode === OpenMode.CreateNew && odspResolvedUrl.newFileInfoPromise) {
            odspResolvedUrl = await createNewFluidFile(
                getStorageToken,
                odspResolvedUrl.newFileInfoPromise,
                cache);
        }
        return new OdspDocumentService(
            appId,
            odspResolvedUrl.hashedDocumentId,
            odspResolvedUrl.siteUrl,
            odspResolvedUrl.driveId,
            odspResolvedUrl.itemId,
            odspResolvedUrl.endpoints.snapshotStorageUrl,
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

    private storageManager?: OdspDocumentStorageManager;

    private readonly logger: TelemetryLogger;

    private readonly getStorageToken: (refresh: boolean) => Promise<string | null>;
    private readonly getWebsocketToken: (refresh) => Promise<string | null>;

    private readonly localStorageAvailable: boolean;

    private readonly joinSessionKey: string;


    /**
     * @param appId - app id used for telemetry for network requests
     * @param hashedDocumentId - A unique identifer for the document. The "hashed" here implies that the contents of
     * this string contains no end user identifiable information.
     * @param siteUrl - the url of the site that hosts this container
     * @param driveId - the id of the drive that hosts this container
     * @param itemId - the id of the container within the drive
     * @param snapshotStorageUrl - the URL where snapshots should be obtained from
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
        private readonly appId: string,
        private readonly hashedDocumentId: string,
        private readonly siteUrl: string,
        private readonly driveId: string,
        private readonly itemId: string,
        private readonly snapshotStorageUrl: string,
        getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        getWebsocketToken: (refresh) => Promise<string | null>,
        logger: ITelemetryBaseLogger,
        private readonly storageFetchWrapper: IFetchWrapper,
        private readonly deltasFetchWrapper: IFetchWrapper,
        private readonly socketIOClientP: Promise<SocketIOClientStatic>,
        private readonly cache: IOdspCache,
        private readonly isFirstTimeDocumentOpened = true,
    ) {

        this.joinSessionKey = `${this.hashedDocumentId}/joinsession`;

        this.logger = DebugLogger.mixinDebugLogger(
            "fluid:telemetry:OdspDriver",
            logger,
            { docId: hashedDocumentId, odc: isOdcOrigin(new URL(snapshotStorageUrl).origin) });

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
                token = await getStorageToken(this.siteUrl, refresh);
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

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for sharepoint driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        const latestSha: string | null | undefined = undefined;
        this.storageManager = new OdspDocumentStorageManager(
            { app_id: this.appId },
            this.hashedDocumentId,
            this.snapshotStorageUrl,
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

        return new OdspDeltaStorageService(
            { app_id: this.appId },
            urlProvider,
            this.deltasFetchWrapper,
            this.storageManager ? this.storageManager.ops : undefined,
            this.getStorageToken,
            this.logger,
        );
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for sharepoint driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        // Attempt to connect twice, in case we used expired token.
        return getWithRetryForTokenRefresh<IDocumentDeltaConnection>(async (refresh: boolean) => {
            const [websocketEndpoint, webSocketToken, io] =
                await Promise.all([this.joinSession(), this.getWebsocketToken(refresh), this.socketIOClientP]);

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
            ).catch((error) => {
                this.cache.sessionStorage.remove(this.joinSessionKey);
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
        return getSocketStorageDiscovery(
            this.appId,
            this.driveId,
            this.itemId,
            this.siteUrl,
            this.logger,
            this.getStorageToken,
            this.cache,
            this.joinSessionKey);
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
        if (afdCacheValid && url2 !== undefined) {
            debug("Connecting to AFD URL directly due to valid cache.");
            const startAfd = performanceNow();
            let endAfd;
            let afdConnError;

            try {
                const connection = await OdspDocumentDeltaConnection.create(
                    tenantId,
                    websocketId,
                    token,
                    io,
                    client,
                    url2,
                    20000,
                    this.logger,
                );
                logger.sendTelemetryEvent({
                    eventName: "UsedAfdUrl",
                    fromCache: true,
                });
                return connection;
            }
            catch(error) {
                endAfd = performanceNow();
                afdConnError = error;

                localStorage.removeItem(lastAfdConnectionTimeMsKey);

                if (!this.canRetryOnError(afdConnError)) {
                    logger.sendPerformanceEvent({
                        eventName: "FailedAfdUrl-NoNonAfdFallback",
                    }, afdConnError);
                    throw afdConnError;
                }
            }

            // eslint-disable-next-line max-len
            debug(`Socket connection error on AFD URL (cached). Error was [${afdConnError}]. Retry on non-AFD URL: ${url}`);

            try {
                const connection = await OdspDocumentDeltaConnection.create(
                    tenantId,
                    websocketId,
                    token,
                    io,
                    client,
                    url,
                    20000,
                    this.logger,
                );
                logger.sendPerformanceEvent({
                    eventName: "UsedNonAfdUrlFallback",
                    duration: endAfd - startAfd,
                }, afdConnError);
                return connection;
            }
            catch(retryError) {
                logger.sendPerformanceEvent({
                    eventName: "FailedNonAfdUrlFallback",
                    duration: endAfd - startAfd,
                }, retryError);
                throw retryError;
            }
        }

        const startNonAfd = performanceNow();
        let endNonAfd;
        let nonAfdConnError;

        try {
            const connection = await OdspDocumentDeltaConnection.create(
                tenantId,
                websocketId,
                token,
                io,
                client,
                url,
                url2 === undefined ? 20000 : 15000,
                this.logger,
            );
            logger.sendTelemetryEvent({ eventName: "UsedNonAfdUrl" });
            return connection;
        }
        catch(error) {
            endNonAfd = performanceNow();
            nonAfdConnError = error;

            if (!this.canRetryOnError(nonAfdConnError) || url2 === undefined) {
                logger.sendPerformanceEvent({
                    eventName: "FailedNonAfdUrl-NoAfdFallback",
                }, nonAfdConnError);
                throw nonAfdConnError;
            }
        }

        debug(`Socket connection error on non-AFD URL. Error was [${nonAfdConnError}]. Retry on AFD URL: ${url2}`);

        try
        {
            const connection = await OdspDocumentDeltaConnection.create(
                tenantId,
                websocketId,
                token,
                io,
                client,
                url2,
                20000,
                this.logger,
            );
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
            }, nonAfdConnError);

            return connection;
        }
        catch(retryError) {
            logger.sendPerformanceEvent({
                eventName: "FailedAfdUrlFallback",
                duration: endNonAfd - startNonAfd,
            }, retryError);
            throw retryError;
        }
    }
}
