/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { performance } from "@fluidframework/common-utils";
import {
    ChildLogger,
    IFluidErrorBase,
    loggerToMonitoringContext,
    MonitoringContext,
    normalizeError,
} from "@fluidframework/telemetry-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IResolvedUrl,
    IDocumentStorageService,
    IDocumentServicePolicies,
    DriverErrorType,
} from "@fluidframework/driver-definitions";
import { DeltaStreamConnectionForbiddenError, NonRetryableError } from "@fluidframework/driver-utils";
import { IFacetCodes } from "@fluidframework/odsp-doclib-utils";
import {
    IClient,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import {
    IOdspResolvedUrl,
    TokenFetchOptions,
    IEntry,
    HostStoragePolicy,
    InstrumentedStorageTokenFetcher,
    OdspErrorType,
} from "@fluidframework/odsp-driver-definitions";
import type { io as SocketIOClientStatic } from "socket.io-client";
import { HostStoragePolicyInternal, ISocketStorageDiscovery } from "./contracts";
import { IOdspCache } from "./odspCache";
import { OdspDeltaStorageService, OdspDeltaStorageWithCache } from "./odspDeltaStorageService";
import { OdspDocumentDeltaConnection } from "./odspDocumentDeltaConnection";
import { OdspDocumentStorageService } from "./odspDocumentStorageManager";
import { getWithRetryForTokenRefresh, getOdspResolvedUrl, TokenFetchOptionsEx } from "./odspUtils";
import { fetchJoinSession } from "./vroom";
import { isOdcOrigin } from "./odspUrlHelper";
import { EpochTracker } from "./epochTracker";
import { OpsCache } from "./opsCaching";
import { RetryErrorsStorageAdapter } from "./retryErrorsStorageAdapter";
import { pkgVersion as driverVersion } from "./packageVersion";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService implements IDocumentService {
    private _policies: IDocumentServicePolicies;
    // Timer which runs and executes the join session call after intervals.
    private joinSessionRefreshTimer: ReturnType<typeof setTimeout> | undefined;
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
     * @param socketReferenceKeyPrefix - (optional) prefix to isolate socket reuse cache
     */
    public static async create(
        resolvedUrl: IResolvedUrl,
        getStorageToken: InstrumentedStorageTokenFetcher,
        getWebsocketToken: ((options: TokenFetchOptions) => Promise<string | null>) | undefined,
        logger: ITelemetryLogger,
        socketIoClientFactory: () => Promise<typeof SocketIOClientStatic>,
        cache: IOdspCache,
        hostPolicy: HostStoragePolicy,
        epochTracker: EpochTracker,
        socketReferenceKeyPrefix?: string,
        clientIsSummarizer?: boolean,
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
            socketReferenceKeyPrefix,
            clientIsSummarizer,
        );
    }

    private storageManager?: OdspDocumentStorageService;

    private readonly mc: MonitoringContext;

    private readonly joinSessionKey: string;

    private readonly hostPolicy: HostStoragePolicyInternal;

    private _opsCache?: OpsCache;

    private currentConnection?: OdspDocumentDeltaConnection;

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
     * @param hostPolicy - host constructed policy which customizes service behavior.
     * @param epochTracker - This helper class which adds epoch to backend calls made by this service instance.
     * @param socketReferenceKeyPrefix - (optional) prefix to isolate socket reuse cache
     */
    private constructor(
        public readonly odspResolvedUrl: IOdspResolvedUrl,
        private readonly getStorageToken: InstrumentedStorageTokenFetcher,
        private readonly getWebsocketToken: ((options: TokenFetchOptions) => Promise<string | null>) | undefined,
        logger: ITelemetryLogger,
        private readonly socketIoClientFactory: () => Promise<typeof SocketIOClientStatic>,
        private readonly cache: IOdspCache,
        hostPolicy: HostStoragePolicy,
        private readonly epochTracker: EpochTracker,
        private readonly socketReferenceKeyPrefix?: string,
        private readonly clientIsSummarizer?: boolean,
    ) {
        this._policies = {
            // load in storage-only mode if a file version is specified
            storageOnly: odspResolvedUrl.fileVersion !== undefined,
        };

        this.joinSessionKey = `${this.odspResolvedUrl.hashedDocumentId}/joinsession`;
        this.mc = loggerToMonitoringContext(
            ChildLogger.create(logger,
            undefined,
            {
                all: {
                    odc: isOdcOrigin(new URL(this.odspResolvedUrl.endpoints.snapshotStorageUrl).origin),
                },
            }));

        this.hostPolicy = hostPolicy;
        this.hostPolicy.fetchBinarySnapshotFormat ??=
            this.mc.config.getBoolean("Fluid.Driver.Odsp.binaryFormatSnapshot");
        if (this.clientIsSummarizer) {
            this.hostPolicy = { ...this.hostPolicy, summarizerClient: true };
        }
    }

    public get resolvedUrl(): IResolvedUrl {
        return this.odspResolvedUrl;
    }
    public get policies() {
        return this._policies;
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
                this.mc.logger,
                true,
                this.cache,
                this.hostPolicy,
                this.epochTracker,
                // flushCallback
                async () => {
                    if (this.currentConnection !== undefined && !this.currentConnection.disposed) {
                        return this.currentConnection.flush();
                    }
                    throw new Error("Disconnected while uploading summary (attempt to perform flush())");
                },
            );
        }

        return new RetryErrorsStorageAdapter(this.storageManager, this.mc.logger);
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
            this.mc.logger,
        );

        // batch size, please see issue #5211 for data around batch sizing
        const batchSize = this.hostPolicy.opsBatchSize ?? 5000;
        const concurrency = this.hostPolicy.concurrentOpsBatches ?? 1;
        return new OdspDeltaStorageWithCache(
            snapshotOps,
            this.mc.logger,
            batchSize,
            concurrency,
            async (from, to, telemetryProps, fetchReason) => service.get(from, to, telemetryProps, fetchReason),
            async (from, to) => {
                const res = await this.opsCache?.get(from, to);
                return res as ISequencedDocumentMessage[] ?? [];
            },
            (from, to) => {
                if (this.currentConnection !== undefined && !this.currentConnection.disposed) {
                    this.currentConnection.requestOps(from, to);
                }
            },
            (ops: ISequencedDocumentMessage[]) => this.opsReceived(ops),
        );
    }

    /** Annotate the given error indicating which connection step failed */
    private annotateConnectionError(
        error: any,
        failedConnectionStep: string,
        separateTokenRequest: boolean,
    ): IFluidErrorBase {
        return normalizeError(error, { props: {
            failedConnectionStep,
            separateTokenRequest,
        }});
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

            const annotateAndRethrowConnectionError = (step: string) => (error: any) => {
                throw this.annotateConnectionError(error, step, !requestWebsocketTokenFromJoinSession);
            };

            const joinSessionPromise = this.joinSession(requestWebsocketTokenFromJoinSession, options);
            const [websocketEndpoint, websocketToken, io] =
                await Promise.all([
                    joinSessionPromise.catch(annotateAndRethrowConnectionError("joinSession")),
                    websocketTokenPromise.catch(annotateAndRethrowConnectionError("getWebsocketToken")),
                    this.socketIoClientFactory().catch(annotateAndRethrowConnectionError("socketIoClientFactory")),
                ]);

            const finalWebsocketToken = websocketToken ?? (websocketEndpoint.socketToken || null);
            if (finalWebsocketToken === null) {
                throw this.annotateConnectionError(
                    new NonRetryableError(
                        "Websocket token is null",
                        OdspErrorType.fetchTokenError,
                        { driverVersion },
                    ),
                    "getWebsocketToken",
                    !requestWebsocketTokenFromJoinSession);
            }
            try {
                const connection = await this.createDeltaConnection(
                    websocketEndpoint.tenantId,
                    websocketEndpoint.id,
                    finalWebsocketToken,
                    io,
                    client,
                    websocketEndpoint.deltaStreamSocketUrl);
                connection.on("op", (documentId, ops: ISequencedDocumentMessage[]) => {
                    this.opsReceived(ops);
                });
                // On disconnect with 401/403 error code, we can just clear the joinSession cache as we will again
                // get the auth error on reconnecting and face latency.
                connection.on("disconnect", (error: any) => {
                    // Clear the join session refresh timer so that it can be restarted on reconnection.
                    this.clearJoinSessionTimer();
                    if (typeof error === "object" && error !== null
                        && error.errorType === DriverErrorType.authorizationError) {
                        this.cache.sessionJoinCache.remove(this.joinSessionKey);
                    }
                });
                this.currentConnection = connection;
                return connection;
            } catch (error) {
                this.cache.sessionJoinCache.remove(this.joinSessionKey);

                const normalizedError = this.annotateConnectionError(
                    error,
                    "createDeltaConnection",
                    !requestWebsocketTokenFromJoinSession);
                if (typeof error === "object" && error !== null) {
                    normalizedError.addTelemetryProperties({socketDocumentId: websocketEndpoint.id});
                }
                throw normalizedError;
            }
        });
    }

    private clearJoinSessionTimer() {
        if (this.joinSessionRefreshTimer !== undefined) {
            clearTimeout(this.joinSessionRefreshTimer);
            this.joinSessionRefreshTimer = undefined;
        }
    }

    private async scheduleJoinSessionRefresh(delta: number) {
        await new Promise<void>((resolve, reject) => {
            this.joinSessionRefreshTimer = setTimeout(() => {
                getWithRetryForTokenRefresh(async (options) => {
                    await this.joinSession(false, options);
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
            }, delta);
        });
    }

    private async joinSession(
        requestSocketToken: boolean,
        options: TokenFetchOptionsEx,
    ) {
        return this.joinSessionCore(requestSocketToken, options).catch((e) => {
            const likelyFacetCodes = e as IFacetCodes;
            if (Array.isArray(likelyFacetCodes.facetCodes)) {
                for (const code of likelyFacetCodes.facetCodes) {
                    switch (code) {
                        case "sessionForbiddenOnPreservedFiles":
                        case "sessionForbiddenOnModerationEnabledLibrary":
                        case "sessionForbiddenOnRequireCheckout":
                            // This document can only be opened in storage-only mode.
                            // DeltaManager will recognize this error
                            // and load without a delta stream connection.
                            this._policies = {...this._policies,storageOnly: true};
                            throw new DeltaStreamConnectionForbiddenError(code, { driverVersion });
                        default:
                            continue;
                    }
                }
            }
            throw e;
        });
    }

    private async joinSessionCore(
        requestSocketToken: boolean,
        options: TokenFetchOptionsEx,
    ): Promise<ISocketStorageDiscovery> {
        const disableJoinSessionRefresh = this.mc.config.getBoolean("Fluid.Driver.Odsp.disableJoinSessionRefresh");
        const executeFetch = async () => {
            const joinSessionResponse = await fetchJoinSession(
                this.odspResolvedUrl,
                "opStream/joinSession",
                "POST",
                this.mc.logger,
                this.getStorageToken,
                this.epochTracker,
                requestSocketToken,
                options,
                disableJoinSessionRefresh,
                this.hostPolicy.sessionOptions?.unauthenticatedUserDisplayName,
            );
            return {
                entryTime: Date.now(),
                joinSessionResponse,
            };
        };

        const getResponseAndRefreshAfterDeltaMs = async () => {
            let _response = await this.cache.sessionJoinCache.addOrGet(this.joinSessionKey, executeFetch);
            // If the response does not contain refreshSessionDurationSeconds, then treat it as old flow and let the
            // cache entry to be treated as expired after 1 hour.
            _response.joinSessionResponse.refreshSessionDurationSeconds =
                _response.joinSessionResponse.refreshSessionDurationSeconds ?? 3600;
            return {
                ..._response,
                refreshAfterDeltaMs: this.calculateJoinSessionRefreshDelta(
                    _response.entryTime, _response.joinSessionResponse.refreshSessionDurationSeconds),
            };
        };
        let response = await getResponseAndRefreshAfterDeltaMs();
        // This means that the cached entry has expired(This should not be possible if the response is fetched
        // from the network call). In this case we remove the cached entry and fetch the new response.
        if (response.refreshAfterDeltaMs <= 0) {
            this.cache.sessionJoinCache.remove(this.joinSessionKey);
            response = await getResponseAndRefreshAfterDeltaMs();
        }
        if (!disableJoinSessionRefresh) {
            const props = {
                entryTime: response.entryTime,
                refreshSessionDurationSeconds:
                    response.joinSessionResponse.refreshSessionDurationSeconds,
                refreshAfterDeltaMs: response.refreshAfterDeltaMs,
            };
            if (response.refreshAfterDeltaMs > 0) {
                this.scheduleJoinSessionRefresh(response.refreshAfterDeltaMs)
                    .catch((error) => {
                        this.mc.logger.sendErrorEvent({
                                eventName: "JoinSessionRefreshError",
                                ...props,
                            },
                            error,
                        );
                    });
            } else {
                // Logging just for informational purposes to help with debugging as this is a new feature.
                this.mc.logger.sendErrorEvent({
                    eventName: "JoinSessionRefreshNotScheduled",
                    ...props,
                });
            }
        }
        return response.joinSessionResponse;
    }

    private calculateJoinSessionRefreshDelta(responseFetchTime: number, refreshSessionDurationSeconds: number) {
        // 30 seconds is buffer time to refresh the session.
        return responseFetchTime + ((refreshSessionDurationSeconds * 1000) - 30000) - Date.now();
    }

    /**
     * Creats a connection to the given delta stream endpoint
     *
     * @param tenantId - the ID of the tenant
     * @param documentId - document ID
     * @param token - authorization token for delta service
     * @param io - websocket library
     * @param client - information about the client
     * @param webSocketUrl - websocket URL
     */
    private async createDeltaConnection(
        tenantId: string,
        documentId: string,
        token: string | null,
        io: typeof SocketIOClientStatic,
        client: IClient,
        webSocketUrl: string,
    ): Promise<OdspDocumentDeltaConnection> {
        const startTime = performance.now();
        const connection = await OdspDocumentDeltaConnection.create(
            tenantId,
            documentId,
            token,
            io,
            client,
            webSocketUrl,
            this.mc.logger,
            60000,
            this.epochTracker,
            this.socketReferenceKeyPrefix,
        );
        const duration = performance.now() - startTime;
        // This event happens rather often, so it adds up to cost of telemetry.
        // Given that most reconnects result in reusing socket and happen very quickly,
        // report event only if it took longer than threshold.
        if (duration >= 2000) {
            this.mc.logger.sendPerformanceEvent({
                eventName: "ConnectionSuccess",
                duration,
            });
        }
        return connection;
    }

    public dispose(error?: any) {
        // Error might indicate mismatch between client & server knowlege about file
        // (DriverErrorType.fileOverwrittenInStorage).
        // For example, file might have been overwritten in storage without generating new epoch
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
            this.mc.logger,
            // ICache
            {
                write: async (key: string, opsData: string) => {
                    return this.cache.persistedCache.put({...opsKey, key}, opsData);
                },
                read: async (key: string) => this.cache.persistedCache.get({...opsKey, key}),
                remove: () => { this.cache.persistedCache.removeEntries().catch(() => {}); },
            },
            batchSize,
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
