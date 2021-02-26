/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import {
    ChildLogger,
    PerformanceEvent,
} from "@fluidframework/telemetry-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { fetchTokenErrorCode, throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import { IOdspResolvedUrl, HostStoragePolicy } from "./contracts";
import {
    LocalPersistentCache,
    createOdspCache,
    NonPersistentCache,
    IPersistedCache,
    LocalPersistentCacheAdapter,
} from "./odspCache";
import { OdspDocumentService } from "./odspDocumentService";
import { INewFileInfo } from "./odspUtils";
import { createNewFluidFile } from "./createFile";
import {
    TokenFetchOptions,
    isTokenFromCache,
    tokenFromResponse,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
} from "./tokenFetch";
import { EpochTracker, EpochTrackerWithRedemption } from "./epochTracker";

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
        createNewSummary: ISummaryTree,
        createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(createNewResolvedUrl);

        let odspResolvedUrl = createNewResolvedUrl as IOdspResolvedUrl;
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

        const logger2 = ChildLogger.create(logger, "OdspDriver");
        const epochTracker = new EpochTracker(new LocalPersistentCacheAdapter(this.persistedCache), logger2);
        return PerformanceEvent.timedExecAsync(
            logger2,
            {
                eventName: "CreateNew",
                isWithSummaryUpload: true,
            },
            async (event) => {
                odspResolvedUrl = await createNewFluidFile(
                    this.toInstrumentedOdspTokenFetcher(
                        logger2,
                        odspResolvedUrl,
                        this.getStorageToken,
                        "CreateNewFile",
                        true /* throwOnNullToken */,
                    ),
                    newFileParams,
                    logger2,
                    createNewSummary,
                    epochTracker,
                );
                const docService = this.createDocumentService(odspResolvedUrl, logger, epochTracker);
                event.end({
                    docId: odspResolvedUrl.hashedDocumentId,
                });
                return docService;
            });
    }

    /**
   * @param getStorageToken - function that can provide the storage token for a given site. This is
   * is also referred to as the "VROOM" token in SPO.
   * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
   * referred to as the "Push" token in SPO.
   * @param storageFetchWrapper - if not provided FetchWrapper will be used
   * @param deltasFetchWrapper - if not provided FetchWrapper will be used
   * @param persistedCache - PersistedCache provided by host for use in this session.
   */
    constructor(
        private readonly getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
        private readonly getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions>,
        private readonly getSocketIOClient: () => Promise<SocketIOClientStatic>,
        protected persistedCache: IPersistedCache = new LocalPersistentCache(),
        private readonly hostPolicy: HostStoragePolicy = {},
    ) {
    }

    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        epochTracker?: EpochTracker,
    ): Promise<IDocumentService> {
        const odspLogger = ChildLogger.create(logger, "OdspDriver");
        const cache = createOdspCache(
            this.persistedCache,
            this.nonPersistentCache,
            odspLogger);

        return OdspDocumentService.create(
            resolvedUrl,
            this.toInstrumentedOdspTokenFetcher(
                odspLogger,
                resolvedUrl as IOdspResolvedUrl,
                this.getStorageToken,
                "OdspDocumentService",
                true /* throwOnNullToken */,
            ),
            this.toInstrumentedOdspTokenFetcher(
                odspLogger,
                resolvedUrl as IOdspResolvedUrl,
                this.getWebsocketToken,
                "GetWebsocketToken",
                false /* throwOnNullToken */,
            ),
            odspLogger,
            this.getSocketIOClient,
            cache,
            this.hostPolicy,
            epochTracker ?? new EpochTrackerWithRedemption(
                new LocalPersistentCacheAdapter(this.persistedCache), odspLogger),
        );
    }

    private toInstrumentedOdspTokenFetcher(
        logger: ITelemetryLogger,
        resolvedUrl: IOdspResolvedUrl,
        tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>,
        defaultEventName: string,
        throwOnNullToken: boolean,
    ): (options: TokenFetchOptions, name?: string) => Promise<string | null> {
        return async (options: TokenFetchOptions, name?: string) => {
            // Telemetry note: if options.refresh is true, there is a potential perf issue:
            // Host should optimize and provide non-expired tokens on all critical paths.
            // Exceptions: race conditions around expiration, revoked tokens, host that does not care
            // (fluid-fetcher)
            return PerformanceEvent.timedExecAsync(
                logger,
                {
                    eventName: `${name || defaultEventName}_GetToken`,
                    attempts: options.refresh ? 2 : 1,
                    hasClaims: !!options.claims,
                    hasTenantId: !!options.tenantId,
                },
                async (event) => tokenFetcher({ ...options, siteUrl: resolvedUrl.siteUrl })
                .then((tokenResponse) => {
                    const token = tokenFromResponse(tokenResponse);
                    event.end({ fromCache: isTokenFromCache(tokenResponse), isNull: token === null ? true : false });
                    if (token === null && throwOnNullToken) {
                        throwOdspNetworkError(`${name || defaultEventName} Token is null`, fetchTokenErrorCode);
                    }
                    return token;
                }));
        };
    }
}
