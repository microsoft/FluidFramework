/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { NetworkError, SinglePromise, TelemetryNullLogger } from "@microsoft/fluid-core-utils";
import { DocumentDeltaConnection } from "@microsoft/fluid-driver-base";
import {
    ConnectionMode,
    IClient,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IErrorTrackingService,
} from "@microsoft/fluid-protocol-definitions";
import { IOdspSocketError, ISocketStorageDiscovery } from "./contracts";
import { debug } from "./debug";
import { IFetchWrapper } from "./fetchWrapper";
import { OdspDeltaStorageService } from "./OdspDeltaStorageService";
import { OdspDocumentStorageManager } from "./OdspDocumentStorageManager";
import { OdspDocumentStorageService } from "./OdspDocumentStorageService";
import { defaultRetryFilter } from "./OdspUtils";
import { getSocketStorageDiscovery } from "./Vroom";

const afdUrlConnectExpirationMs = 6 * 60 * 60 * 1000; // 6 hours
const lastAfdConnectionTimeMsKey = "LastAfdConnectionTimeMs";
const localStorageTestKey = "LocalStorageTestKey";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService implements IDocumentService {
    private static errorObjectFromOdspError(socketError: IOdspSocketError) {
        return new NetworkError(
            socketError.message,
            socketError.code,
            defaultRetryFilter(socketError.code), // canRetry
            socketError.retryAfter);
    }

    // This should be used to make web socket endpoint requests, it ensures we only have one active join session call at a time.
    private readonly websocketEndpointRequestThrottler: SinglePromise<ISocketStorageDiscovery>;

    // This is the result of a call to websocketEndpointSingleP, it is used to make sure that we don't make two join session
    // calls to handle connecting to delta storage and delta stream.
    private websocketEndpointP: Promise<ISocketStorageDiscovery> | undefined;

    private storageManager?: OdspDocumentStorageManager;

    private readonly getStorageToken: (refresh: boolean) => Promise<string | null>;

    private readonly localStorageAvailable: boolean;

    /**
     * @param appId - app id used for telemetry for network requests
     * @param hashedDocumentId - A unique identifer for the document. The "hashed" here implies that the contents of this string
     * contains no end user identifiable information.
     * @param siteUrl - the url of the site that hosts this container
     * @param driveId - the id of the drive that hosts this container
     * @param itemId - the id of the container within the drive
     * @param snapshotStorageUrl - the URL where snapshots should be obtained from
     * @param getStorageToken - function that can provide the storage token for a given site. This is
     * is also referred to as the "VROOM" token in SPO.
     * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
     * referred to as the "Push" token in SPO.
     * @param logger - a logger that can capture performance and diagnostic information
     * @param storageFetchWrapper - if not provided FetchWrapper will be used
     * @param deltasFetchWrapper - if not provided FetchWrapper will be used
     * @param socketIOClientP - promise to the socket io library required by the driver
     */
    constructor(
        private readonly appId: string,
        private readonly hashedDocumentId: string,
        private readonly siteUrl: string,
        driveId: string,
        itemId: string,
        private readonly snapshotStorageUrl: string,
        getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        readonly getWebsocketToken: () => Promise<string | null>,
        private readonly logger: ITelemetryLogger,
        private readonly storageFetchWrapper: IFetchWrapper,
        private readonly deltasFetchWrapper: IFetchWrapper,
        private readonly socketIOClientP: Promise<SocketIOClientStatic>,
    ) {
        this.getStorageToken = (refresh: boolean) => {
            if (refresh) {
                // Potential perf issue:
                // Host should optimize and provide non-expired tokens on all critical paths.
                // Exceptions: race conditions around expiration, revoked tokens, host that does not care (fluid-fetcher)
                this.logger.sendTelemetryEvent({eventName: "StorageTokenRefresh"});
            }
            return getStorageToken(this.siteUrl, refresh);
        };

        this.websocketEndpointRequestThrottler = new SinglePromise(() =>
            getSocketStorageDiscovery(
                appId,
                driveId,
                itemId,
                siteUrl,
                logger,
                this.getStorageToken,
            ),
        );

        this.localStorageAvailable = this.testLocalStorageAvailability();
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
            if (!this.websocketEndpointP) {
              // We should never get here
              // the very first (proactive) call to fetch ops should be serviced from latest snapshot, resulting in no opStream call
              // any other requests are result of catching up on missing ops and are coming after websocket is established (or reconnected),
              // and thus we already have fresh join session call.
              // That said, tools like Fluid-fetcher will hit it, so that's valid code path.
              this.logger.sendErrorEvent({ eventName: "ExtraJoinSessionCall" });

              this.websocketEndpointP = this.websocketEndpointRequestThrottler.response;
            }
            const websocketEndpoint = await this.websocketEndpointP;
            return websocketEndpoint.deltaStorageUrl;
        };

        return new OdspDeltaStorageService(
            { app_id: this.appId },
            urlProvider,
            this.deltasFetchWrapper,
            this.storageManager ? this.storageManager.ops : undefined,
            this.getStorageToken,
        );
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for sharepoint driver.
     */
    public async connectToDeltaStream(client: IClient, mode: ConnectionMode): Promise<IDocumentDeltaConnection> {
        // We should refresh our knowledge before attempting to reconnect
        this.websocketEndpointP = this.websocketEndpointRequestThrottler.response;

        const [websocketEndpoint, webSocketToken, io] = await Promise.all([this.websocketEndpointP, this.getWebsocketToken(), this.socketIOClientP]);

        return this.connectToDeltaStreamWithRetry(
            websocketEndpoint.tenantId,
            websocketEndpoint.id,
            // This is workaround for fluid-fetcher. Need to have better long term solution
            webSocketToken ? webSocketToken : websocketEndpoint.socketToken,
            io,
            client,
            mode,
            websocketEndpoint.deltaStreamSocketUrl,
            websocketEndpoint.deltaStreamSocketUrl2,
        ).then((connection) => {
            connection.on("server_disconnect", (socketError: IOdspSocketError) => {
                const error = OdspDocumentService.errorObjectFromOdspError(socketError);
                // Raise it as disconnect.
                // That produces cleaner telemetry (no errors) and keeps protocol simpler (and not driver-specific).
                connection.emit("disconnect", error);
            });
            return connection;
        }).catch((error) => {
            // Test if it's NetworkError with IOdspSocketError.
            // Note that there might be no IOdspSocketError on it in case we hit socket.io protocol errors!
            // So we test canRetry property first - if it false, that means protocol is broken and reconnecting will not help.
            if (error instanceof NetworkError && error.canRetry) {
                const socketError: IOdspSocketError = (error as any).socketError;
                if (typeof socketError === "object" && socketError !== null) {
                    throw OdspDocumentService.errorObjectFromOdspError(socketError);
                }
            }

            throw error;
        });
    }

    public async branch(): Promise<string> {
        return "";
    }

    public getErrorTrackingService(): IErrorTrackingService {
        return { track: () => null };
    }

    /**
     * Tests if localStorage is usable.
     * Should we move this outside to a library?
     */
    private testLocalStorageAvailability(): boolean {
        try {
            localStorage.setItem(localStorageTestKey, "v");
            localStorage.removeItem(localStorageTestKey);
            return true;
        } catch (e) {
            debug(`LocalStorage not available due to ${e}`);
            return false;
        }
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
     * Test if we deal with INetworkError / NetworkError object and if it has enough information to make a call
     * If in doubt, allow retries
     *
     * @param error - error object
     */
    private canRetryOnError(error: any) {
        // Always retry unless told otherwise.
        // tslint:disable-next-line:no-unsafe-any
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
    // tslint:disable-next-line: max-func-body-length
    private async connectToDeltaStreamWithRetry(
        tenantId: string,
        id: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        mode: ConnectionMode,
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
                const startAfd = performance.now();

                return DocumentDeltaConnection.create(
                    tenantId,
                    id,
                    token,
                    io,
                    client,
                    mode,
                    // tslint:disable-next-line: no-non-null-assertion
                    url2!,
                    20000,
                ).then((connection) => {
                    logger.sendTelemetryEvent({
                        eventName: "UsedAfdUrl",
                        fromCache: true,
                    });

                    return connection;
                }).catch((connectionError) => {
                    const endAfd = performance.now();
                    localStorage.removeItem(lastAfdConnectionTimeMsKey);
                    // Retry on non-AFD URL
                    if (this.canRetryOnError(connectionError)) {
                        debug(`Socket connection error on AFD URL (cached). Error was [${connectionError}]. Retry on non-AFD URL: ${url}`);

                        return DocumentDeltaConnection.create(
                            tenantId,
                            id,
                            token,
                            io,
                            client,
                            mode,
                            url,
                            20000,
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
                        logger.sendErrorEvent({
                            eventName: "FailedAfdUrl-NoNonAfdFallback",
                        }, connectionError);
                    }

                    throw connectionError;
                });
            }

            const startNonAfd = performance.now();
            return DocumentDeltaConnection.create(
                tenantId,
                id,
                token,
                io,
                client,
                mode,
                url,
                hasUrl2 ? 15000 : 20000,
            ).then((connection) => {
                logger.sendTelemetryEvent({ eventName: "UsedNonAfdUrl" });
                return connection;
            }).catch((connectionError) => {
                const endNonAfd = performance.now();
                if (hasUrl2 && this.canRetryOnError(connectionError)) {
                    debug(`Socket connection error on non-AFD URL. Error was [${connectionError}]. Retry on AFD URL: ${url2}`);

                    return DocumentDeltaConnection.create(
                        tenantId,
                        id,
                        token,
                        io,
                        client,
                        mode,
                        // tslint:disable-next-line: no-non-null-assertion
                        url2!,
                        20000,
                    ).then((connection) => {
                        // Refresh AFD cache
                        const cacheResult = this.writeLocalStorage(lastAfdConnectionTimeMsKey, Date.now().toString());
                        if (cacheResult) {
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
                    logger.sendErrorEvent({
                        eventName: "FailedNonAfdUrl-NoAfdFallback",
                    }, connectionError);
                }

                throw connectionError;
            });
        }

}
