/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageServicePolicies,
    IResolvedUrl,
    LoaderCachingPolicy,
} from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import {
    TelemetryLogger,
    PerformanceEvent,
    mixinMonitoringContext,
    MonitoringContext,
} from "@fluidframework/telemetry-utils";
import {
    getDocAttributesFromProtocolSummary,
    ensureFluidResolvedUrl,
} from "@fluidframework/driver-utils";
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

// Please update the README file in odsp-driver-definitions if you change the defaultCacheExpiryTimeoutMs.
export const defaultCacheExpiryTimeoutMs: number = 2 * 24 * 60 * 60 * 1000;

const defaultStoragePolicy: Required<IDocumentStorageServicePolicies> = {
    // By default, ODSP tells the container not to prefetch/cache.
    caching: LoaderCachingPolicy.NoCaching,

    // ODSP storage works better if it has less number of blobs / edges
    // Runtime creating many small blobs results in sub-optimal perf.
    // 2K seems like the sweat spot:
    // The smaller the number, less blobs we aggregate. Most storages are very likely to have notion
    // of minimal "cluster" size, so having small blobs is wasteful
    // At the same time increasing the limit ensure that more blobs with user content are aggregated,
    // reducing possibility for de-duping of same blobs (i.e. .attributes rolled into aggregate blob
    // are not reused across data stores, or even within data store, resulting in duplication of content)
    // Note that duplication of content should not have significant impact for bytes over wire as
    // compression of http payload mostly takes care of it, but it does impact storage size and in-memory sizes.
    minBlobSize: 2048,
    maximumCacheDurationMs: defaultCacheExpiryTimeoutMs,
};

function getMaximumCacheDurationMs(mc: MonitoringContext): number {
    //* Change Key
    return mc.config.getBoolean("SWEEPV0")
        ? 0
        : defaultStoragePolicy.maximumCacheDurationMs;
}

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
        clientIsSummarizer?: boolean,
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

        const protocolSummary = createNewSummary?.tree[".protocol"];
        if (protocolSummary) {
            const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary as ISummaryTree);
            if (documentAttributes?.sequenceNumber !== 0) {
                throw new Error("Seq number in detached ODSP container should be 0");
            }
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
            odspLogger,
            clientIsSummarizer,
            getMaximumCacheDurationMs(mixinMonitoringContext(odspLogger)));

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
                    odspResolvedUrl.isClpCompliantApp,
                );
                const docService = this.createDocumentServiceCore(odspResolvedUrl, odspLogger,
                    cacheAndTracker, clientIsSummarizer);
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
        // Set enableRedeemFallback by default as true.
        this.hostPolicy.enableRedeemFallback = this.hostPolicy.enableRedeemFallback ?? true;
        this.hostPolicy.sessionOptions = {
            forceAccessTokenViaAuthorizationHeader: true,
            ...this.hostPolicy.sessionOptions,
        };
    }

    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        return this.createDocumentServiceCore(resolvedUrl, createOdspLogger(logger), undefined, clientIsSummarizer);
    }

    protected async createDocumentServiceCore(
        resolvedUrl: IResolvedUrl,
        odspLogger: TelemetryLogger,
        cacheAndTrackerArg?: ICacheAndTracker,
        clientIsSummarizer?: boolean,
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
            odspLogger,
            clientIsSummarizer,
            getMaximumCacheDurationMs(mixinMonitoringContext(odspLogger)));

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

        const storagePolicy: IDocumentStorageServicePolicies = {
            ...defaultStoragePolicy,
            maximumCacheDurationMs: getMaximumCacheDurationMs(mixinMonitoringContext(odspLogger)),
        };

        return OdspDocumentService.create(
            resolvedUrl,
            storageTokenFetcher,
            webSocketTokenFetcher,
            odspLogger,
            this.getSocketIOClient,
            cacheAndTracker.cache,
            { hostPolicy: this.hostPolicy, storagePolicy },
            cacheAndTracker.epochTracker,
            this.socketReferenceKeyPrefix,
            clientIsSummarizer,
        );
    }
}
