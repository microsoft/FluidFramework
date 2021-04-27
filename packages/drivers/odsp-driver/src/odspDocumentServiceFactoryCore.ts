/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
    TelemetryLogger,
    PerformanceEvent,
} from "@fluidframework/telemetry-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { fetchTokenErrorCode, throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import {
    IOdspResolvedUrl,
    TokenFetchOptions,
    OdspResourceTokenFetchOptions,
    isTokenFromCache,
    tokenFromResponse,
    TokenFetcher,
    IPersistedCache,
    HostStoragePolicy,
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
import { INewFileInfo, getOdspResolvedUrl, createOdspLogger } from "./odspUtils";
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
        createNewSummary: ISummaryTree,
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

        const cacheAndTracker = createOdspCacheAndTracker(
            this.persistedCache,
            this.nonPersistentCache,
            { resolvedUrl: odspResolvedUrl, docId: odspResolvedUrl.hashedDocumentId },
            odspLogger);

        return PerformanceEvent.timedExecAsync(
            odspLogger,
            {
                eventName: "CreateNew",
                isWithSummaryUpload: true,
            },
            async (event) => {
                odspResolvedUrl = await createNewFluidFile(
                    this.toInstrumentedOdspTokenFetcher(
                        odspLogger,
                        odspResolvedUrl,
                        this.getStorageToken,
                        true /* throwOnNullToken */,
                    ),
                    newFileParams,
                    odspLogger,
                    createNewSummary,
                    cacheAndTracker.epochTracker,
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

        const storageTokenFetcher = this.toInstrumentedOdspTokenFetcher(
            odspLogger,
            odspResolvedUrl,
            this.getStorageToken,
            true /* throwOnNullToken */,
        );

        const webSocketTokenFetcher = this.getWebsocketToken === undefined
            ? undefined
            : async (options: TokenFetchOptions) => this.toInstrumentedOdspTokenFetcher(
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

    private toInstrumentedOdspTokenFetcher(
        logger: ITelemetryLogger,
        resolvedUrl: IOdspResolvedUrl,
        tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>,
        throwOnNullToken: boolean,
    ): (options: TokenFetchOptions, name: string) => Promise<string | null> {
        return async (options: TokenFetchOptions, name: string) => {
            // Telemetry note: if options.refresh is true, there is a potential perf issue:
            // Host should optimize and provide non-expired tokens on all critical paths.
            // Exceptions: race conditions around expiration, revoked tokens, host that does not care
            // (fluid-fetcher)
            return PerformanceEvent.timedExecAsync(
                logger,
                {
                    eventName: `${name}_GetToken`,
                    attempts: options.refresh ? 2 : 1,
                    hasClaims: !!options.claims,
                    hasTenantId: !!options.tenantId,
                },
                async (event) => tokenFetcher({
                    ...options,
                    siteUrl: resolvedUrl.siteUrl,
                    driveId: resolvedUrl.driveId,
                    itemId: resolvedUrl.itemId,
                }).then((tokenResponse) => {
                    const token = tokenFromResponse(tokenResponse);
                    // This event alone generates so many events that is materially impacts cost of telemetry
                    // Thus do not report end event when it comes back quickly.
                    // Note that most of the hosts do not report if result is comming from cache or not,
                    // so we can't rely on that here
                    if (event.duration >= 32) {
                        event.end({ fromCache: isTokenFromCache(tokenResponse), isNull: token === null });
                    }
                    if (token === null && throwOnNullToken) {
                        throwOdspNetworkError(`${name} Token is null`, fetchTokenErrorCode);
                    }
                    return token;
                }),
                { cancel: "generic" });
        };
    }
}
