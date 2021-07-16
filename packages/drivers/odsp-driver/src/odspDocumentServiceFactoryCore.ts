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
} from "@fluidframework/odsp-driver-definitions";
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

    public async createContainer(
        createNewSummary: ISummaryTree | undefined,
        createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(createNewResolvedUrl);

        let odspResolvedUrl = getOdspResolvedUrl(createNewResolvedUrl);
        const [, queryString] = odspResolvedUrl.url.split("?");

        const searchParams = new URLSearchParams(queryString);
        const filePath = searchParams.get("path");
        if (filePath === undefined || filePath === null) {
            throw new Error("File path should be provided!!");
        }
        const newFileParams: INewFileInfo = {
            driveId: odspResolvedUrl.driveId,
            siteUrl: odspResolvedUrl.siteUrl,
            filePath,
            filename: odspResolvedUrl.fileName,
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
                        odspResolvedUrl,
                        this.getStorageToken,
                        true /* throwOnNullToken */,
                    ),
                    newFileParams,
                    odspLogger,
                    createNewSummary,
                    cacheAndTracker.epochTracker,
                    fileEntry,
                    this.hostPolicy.cacheCreateNewSummary ?? true,
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
        private readonly getSocketIOClient: () => Promise<SocketIOClientStatic>,
        protected persistedCache: IPersistedCache = new LocalPersistentCache(),
        private readonly hostPolicy: HostStoragePolicy = {},
    ) {
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
        const cacheAndTracker = cacheAndTrackerArg ?? createOdspCacheAndTracker(
            this.persistedCache,
            this.nonPersistentCache,
            { resolvedUrl: odspResolvedUrl, docId: odspResolvedUrl.hashedDocumentId },
            odspLogger);

        const storageTokenFetcher = toInstrumentedOdspTokenFetcher(
            odspLogger,
            odspResolvedUrl,
            this.getStorageToken,
            true /* throwOnNullToken */,
        );

        const webSocketTokenFetcher = this.getWebsocketToken === undefined
            ? undefined
            : async (options: TokenFetchOptions) => toInstrumentedOdspTokenFetcher(
                odspLogger,
                odspResolvedUrl,
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
        );
    }
}
