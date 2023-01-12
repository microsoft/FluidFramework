/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    ChildLogger,
    loggerToMonitoringContext,
    MonitoringContext,
} from "@fluidframework/telemetry-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IResolvedUrl,
    IDocumentStorageService,
    IDocumentServicePolicies,
} from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import {
    IOdspResolvedUrl,
    TokenFetchOptions,
    HostStoragePolicy,
    InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions";
import type { io as SocketIOClientStatic } from "socket.io-client";
import { HostStoragePolicyInternal } from "./contracts";
import { IOdspCache } from "./odspCache";
import { OdspDocumentStorageService } from "./odspDocumentStorageManager";
import { getOdspResolvedUrl } from "./odspUtils";
import { isOdcOrigin } from "./odspUrlHelper";
import { EpochTracker } from "./epochTracker";
import { RetryErrorsStorageAdapter } from "./retryErrorsStorageAdapter";
import type { OdspDocumentServiceDelayLoaded } from "./odspDocumentServiceDelayLoaded";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService implements IDocumentService {
    private readonly _policies: IDocumentServicePolicies;

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

    private readonly hostPolicy: HostStoragePolicyInternal;

    private odspDocumentServiceDelayLoaded: OdspDocumentServiceDelayLoaded | undefined;

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

        this.mc = loggerToMonitoringContext(
            ChildLogger.create(logger,
            undefined,
            {
                all: {
                    odc: isOdcOrigin(new URL(this.odspResolvedUrl.endpoints.snapshotStorageUrl).origin),
                },
            }));

        this.hostPolicy = hostPolicy;
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
                    const currentConnection = this.odspDocumentServiceDelayLoaded?.currentDeltaConnection;
                    if (currentConnection !== undefined && !currentConnection.disposed) {
                        return currentConnection.flush();
                    }
                    throw new Error("Disconnected while uploading summary (attempt to perform flush())");
                },
                () => {
                    return this.odspDocumentServiceDelayLoaded?.relayServiceTenantAndSessionId;
                },
                this.mc.config.getNumber("Fluid.Driver.Odsp.snapshotFormatFetchType"),
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
        const service = await this.getDelayLoadedDocumentService();
        return service.connectToDeltaStorage();
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for onedrive/sharepoint driver.
     */
    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
<<<<<<< HEAD
        const service = await this.getDelayLoadedDocumentService();
        return service.connectToDeltaStream(client);
=======
        assert(this.currentConnection === undefined, 0x4ad /* Should not be called when connection is already present! */);
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

            const finalWebsocketToken = websocketToken ?? (websocketEndpoint.socketToken ?? null);
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
                connection.once("disconnect", (error: any) => {
                    // Clear the join session refresh timer so that it can be restarted on reconnection.
                    this.clearJoinSessionTimer();
                    if (typeof error === "object" && error !== null
                        && error.errorType === DriverErrorType.authorizationError) {
                        this.cache.sessionJoinCache.remove(this.joinSessionKey);
                    }
                    // If we hit this assert, it means that "disconnect" event is emitted before the connection went through
                    // dispose flow which is not correct and could lead to a bunch of erros.
                    assert(connection.disposed, 0x4ae /* Connection should be disposed by now */);
                    this.currentConnection = undefined;
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
                    normalizedError.addTelemetryProperties({ socketDocumentId: websocketEndpoint.id });
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
>>>>>>> c2b8d3c31f51764834bfa2655c92b2abf67083fe
    }

    private async getDelayLoadedDocumentService() {
        if (this.odspDocumentServiceDelayLoaded) {
            return this.odspDocumentServiceDelayLoaded;
        }
        const module = await import(/* webpackChunkName: "internalModule" */"./internalModule");
        this.odspDocumentServiceDelayLoaded = new module.OdspDocumentServiceDelayLoaded(
            this.odspResolvedUrl,
            this._policies,
            this.getStorageToken,
            this.getWebsocketToken,
            this.mc,
            this.socketIoClientFactory,
            this.cache,
            this.hostPolicy,
            this.epochTracker,
            () => this.storageManager,
            this.socketReferenceKeyPrefix,
        );
        return this.odspDocumentServiceDelayLoaded;
    }

    public dispose(error?: any) {
        // Error might indicate mismatch between client & server knowlege about file
        // (DriverErrorType.fileOverwrittenInStorage).
        // For example, file might have been overwritten in storage without generating new epoch
        // In such case client cached info is stale and has to be removed.
        if (error !== undefined) {
            this.epochTracker.removeEntries().catch(() => {});
        }
        this.odspDocumentServiceDelayLoaded?.dispose(error);
    }
}
