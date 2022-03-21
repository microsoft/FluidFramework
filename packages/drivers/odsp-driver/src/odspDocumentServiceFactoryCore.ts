/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import {
    TelemetryLogger,
    PerformanceEvent,
} from "@fluidframework/telemetry-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import {
    TokenFetchOptions,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
    IPersistedCache,
    HostStoragePolicy,
    IFileEntry,
    IOdspUrlParts,
} from "@fluidframework/odsp-driver-definitions";
import type { io as SocketIOClientStatic } from "socket.io-client";
import { v4 as uuid } from "uuid";
import {
    LocalPersistentCache,
    NonPersistentCache,
} from "./odspCache";
import {
    createOdspCacheAndTracker,
    ICacheAndTracker,
} from "./epochTracker";
import { OdspDocumentService } from "./odspDocumentService";
import { INewFileInfo, getOdspResolvedUrl, createOdspLogger, toInstrumentedOdspTokenFetcher } from "./odspUtils";
import { createNewFluidFile } from "./createFile";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 *
 * This constructor should be used by environments that support dynamic imports and that wish
 * to leverage code splitting as a means to keep bundles as small as possible.
 */
export class OdspDocumentServiceFactoryCore implements IDocumentServiceFactory {
    public readonly protocolName = "fluid-odsp:";

    private readonly nonPersistentCache = new NonPersistentCache();
    private readonly socketReferenceKeyPrefix?: string;

    public async createContainer(
        createNewSummary: ISummaryTree | undefined,
        createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(createNewResolvedUrl);

        let odspResolvedUrl = getOdspResolvedUrl(createNewResolvedUrl);
        const resolvedUrlData: IOdspUrlParts = {
            siteUrl: odspResolvedUrl.siteUrl,
            driveId: odspResolvedUrl.driveId,
            itemId: odspResolvedUrl.itemId,
        };
        const [, queryString] = odspResolvedUrl.url.split("?");

        const searchParams = new URLSearchParams(queryString);
        const filePath = searchParams.get("path");
        if (filePath === undefined || filePath === null) {
            throw new Error("File path should be provided!!");
        }
        const newFileInfo: INewFileInfo = {
            driveId: odspResolvedUrl.driveId,
            siteUrl: odspResolvedUrl.siteUrl,
            filePath,
            filename: odspResolvedUrl.fileName,
            // set createLinkType to undefined if enableShareLinkWithCreate is set to false,
            // so that share link creation with create file can be enabled
            createLinkType: this.hostPolicy.enableShareLinkWithCreate ?
            odspResolvedUrl.shareLinkInfo?.createLink?.type : undefined,
        };

        const odspLogger = createOdspLogger(logger);

        const fileEntry: IFileEntry = { resolvedUrl: odspResolvedUrl, docId: odspResolvedUrl.hashedDocumentId };
        const cacheAndTracker = createOdspCacheAndTracker(
            this.persistedCache,
            this.nonPersistentCache,
            fileEntry,
            odspLogger);

        return PerformanceEvent.timedExecAsync(
            odspLogger,
            {
                eventName: "CreateNew",
                isWithSummaryUpload: true,
            },
            async (event) => {
                odspResolvedUrl = await createNewFluidFile(
                    toInstrumentedOdspTokenFetcher(
                        odspLogger,
                        resolvedUrlData,
                        this.getStorageToken,
                        true /* throwOnNullToken */,
                    ),
                    newFileInfo,
                    odspLogger,
                    createNewSummary,
                    cacheAndTracker.epochTracker,
                    fileEntry,
                    this.hostPolicy.cacheCreateNewSummary ?? true,
                    !!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
                );
                const docService = this.createDocumentServiceCore(odspResolvedUrl, odspLogger, cacheAndTracker);
                event.end({
                    docId: odspResolvedUrl.hashedDocumentId,
                });
                return docService;
            });
    }

    /**
     * @param getStorageToken - function that can provide the storage token for a given site. This is
     * is also referred to as the "Vroom" token in SPO.
     * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
     * to as the "Push" token in SPO. If undefined then websocket token is expected to be returned with joinSession
     * response payload.
     * @param storageFetchWrapper - if not provided FetchWrapper will be used
     * @param deltasFetchWrapper - if not provided FetchWrapper will be used
     * @param persistedCache - PersistedCache provided by host for use in this session.
     */
    constructor(
        private readonly getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
        private readonly getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
        private readonly getSocketIOClient: () => Promise<typeof SocketIOClientStatic>,
        protected persistedCache: IPersistedCache = new LocalPersistentCache(),
        private readonly hostPolicy: HostStoragePolicy = {},
    ) {
        if (this.hostPolicy.isolateSocketCache === true) {
            // create the key to separate the socket reuse cache
            this.socketReferenceKeyPrefix = uuid();
        }
    }

    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        return this.createDocumentServiceCore(resolvedUrl, createOdspLogger(logger));
    }

    private async createDocumentServiceCore(
        resolvedUrl: IResolvedUrl,
        odspLogger: TelemetryLogger,
        cacheAndTrackerArg?: ICacheAndTracker,
    ): Promise<IDocumentService> {
        const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
        const resolvedUrlData: IOdspUrlParts = {
            siteUrl: odspResolvedUrl.siteUrl,
            driveId: odspResolvedUrl.driveId,
            itemId: odspResolvedUrl.itemId,
        };
        const cacheAndTracker = cacheAndTrackerArg ?? createOdspCacheAndTracker(
            this.persistedCache,
            this.nonPersistentCache,
            { resolvedUrl: odspResolvedUrl, docId: odspResolvedUrl.hashedDocumentId },
            odspLogger);

        const storageTokenFetcher = toInstrumentedOdspTokenFetcher(
            odspLogger,
            resolvedUrlData,
            this.getStorageToken,
            true /* throwOnNullToken */,
        );

        const webSocketTokenFetcher = this.getWebsocketToken === undefined
            ? undefined
            : async (options: TokenFetchOptions) => toInstrumentedOdspTokenFetcher(
                odspLogger,
                resolvedUrlData,
                this.getWebsocketToken!,
                false /* throwOnNullToken */,
            )(options, "GetWebsocketToken");

        return OdspDocumentService.create(
            resolvedUrl,
            storageTokenFetcher,
            webSocketTokenFetcher,
            odspLogger,
            this.getSocketIOClient,
            cacheAndTracker.cache,
            this.hostPolicy,
            cacheAndTracker.epochTracker,
            this.socketReferenceKeyPrefix,
        );
    }
}
