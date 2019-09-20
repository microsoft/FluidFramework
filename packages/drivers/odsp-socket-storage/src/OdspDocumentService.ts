/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { SinglePromise } from "@microsoft/fluid-core-utils";
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
import { IFetchWrapper } from "./fetchWrapper";
import { OdspDeltaStorageService } from "./OdspDeltaStorageService";
import { OdspDocumentStorageManager } from "./OdspDocumentStorageManager";
import { OdspDocumentStorageService } from "./OdspDocumentStorageService";
import { NetworkError } from "./OdspUtils";
import { getSocketStorageDiscovery } from "./Vroom";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class OdspDocumentService implements IDocumentService {
    // This should be used to make web socket endpoint requests, it ensures we only have one active join session call at a time.
    private readonly websocketEndpointRequestThrottler: SinglePromise<ISocketStorageDiscovery>;

    // This is the result of a call to websocketEndpointSingleP, it is used to make sure that we don't make two join session
    // calls to handle connecting to delta storage and delta stream.
    private websocketEndpointP: Promise<ISocketStorageDiscovery> | undefined;

    private storageManager?: OdspDocumentStorageManager;

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
        readonly getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        readonly getWebsocketToken: () => Promise<string | null>,
        private readonly logger: ITelemetryLogger,
        private readonly storageFetchWrapper: IFetchWrapper,
        private readonly deltasFetchWrapper: IFetchWrapper,
        private readonly socketIOClientP: Promise<SocketIOClientStatic>,
    ) {
        this.websocketEndpointRequestThrottler = new SinglePromise(() =>
            getSocketStorageDiscovery(
                appId,
                driveId,
                itemId,
                siteUrl,
                logger,
                getStorageToken,
            ),
        );
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for sharepoint driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        const latestSha: string | null | undefined = null;

        this.storageManager = new OdspDocumentStorageManager(
            { app_id: this.appId },
            this.hashedDocumentId,
            this.snapshotStorageUrl,
            latestSha,
            this.storageFetchWrapper,
            (refresh: boolean) => this.getStorageToken(this.siteUrl, refresh),
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
              this.logger.sendErrorEvent({ eventName: "OdspOpStreamPerf" });

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
            (refresh: boolean) => this.getStorageToken(this.siteUrl, refresh),
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

        return DocumentDeltaConnection.create(
            websocketEndpoint.tenantId,
            websocketEndpoint.id,
            // This is workaround for fluid-fetcher. Need to have better long term solution
            webSocketToken ? webSocketToken : websocketEndpoint.socketToken,
            io,
            client,
            websocketEndpoint.deltaStreamSocketUrl,
            mode,
        ).catch((error) => {
            // Test if it's IOdspSocketError.
            if (typeof error === "object" && error !== null && typeof error.socketError === "object" && error.socketError !== null) {
                const socketError: IOdspSocketError = error.socketError;
                throw new NetworkError(
                socketError.code,
                socketError.message,
                [408, 409, 429, 500, 503].includes(socketError.code), // canRetry
                socketError.retryAfter);
            }

            // Note: Error object here can still have canRetry property - as result of web socket protocol errors
            throw error;
        });
    }

    public async branch(): Promise<string> {
        return "";
    }

    public getErrorTrackingService(): IErrorTrackingService {
        return { track: () => null };
    }
}
