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
import { IOdspResolvedUrl, HostStoragePolicy } from "./contracts";
import {
    LocalPersistentCache,
    createOdspCache,
    NonPersistentCache,
    IPersistedCache,
} from "./odspCache";
import { OdspDocumentService } from "./odspDocumentService";
import { INewFileInfo } from "./odspUtils";
import { createNewFluidFile } from "./createFile";
import {
    StorageTokenFetcher,
    PushTokenFetcher,
    TokenFetchOptions,
    isTokenFromCache,
    tokenFromResponse,
    SharingLinkTokenFetcher,
} from "./tokenFetch";

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
            fileExtension: odspResolvedUrl.fileExtension,
        };

        const logger2 = ChildLogger.create(logger, "OdspDriver");
        return PerformanceEvent.timedExecAsync(
            logger2,
            {
                eventName: "CreateNew",
                isWithSummaryUpload: true,
            },
            async (event) => {
                odspResolvedUrl = await createNewFluidFile(
                    this.toInstrumentedStorageTokenFetcher(logger2, odspResolvedUrl, this.getStorageToken),
                    newFileParams,
                    logger2,
                    createNewSummary,
                    this.getSharingLinkToken ?
                        this.toInstrumentedSharingLinkTokenFetcher(logger2, this.getSharingLinkToken) : undefined);
                const docService = this.createDocumentService(odspResolvedUrl, logger);
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
   * @param getSharingLinkToken - function that can provide token used to fetch share link for a container.
   */
    constructor(
        private readonly getStorageToken: StorageTokenFetcher,
        private readonly getWebsocketToken: PushTokenFetcher,
        private readonly getSocketIOClient: () => Promise<SocketIOClientStatic>,
        protected persistedCache: IPersistedCache = new LocalPersistentCache(),
        private readonly hostPolicy: HostStoragePolicy = {},
        private readonly getSharingLinkToken?: SharingLinkTokenFetcher,
    ) {
    }

    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        const odspLogger = ChildLogger.create(logger, "OdspDriver");
        const cache = createOdspCache(
            this.persistedCache,
            this.nonPersistentCache,
            odspLogger);

        return OdspDocumentService.create(
            resolvedUrl,
            this.toInstrumentedStorageTokenFetcher(odspLogger, resolvedUrl as IOdspResolvedUrl, this.getStorageToken),
            this.toInstrumentedPushTokenFetcher(odspLogger, this.getWebsocketToken),
            odspLogger,
            this.getSocketIOClient,
            cache,
            this.hostPolicy,
        );
    }

    private toInstrumentedStorageTokenFetcher(
        logger: ITelemetryLogger,
        resolvedUrl: IOdspResolvedUrl,
        tokenFetcher: StorageTokenFetcher,
    ): (options: TokenFetchOptions, name?: string) => Promise<string | null> {
        return async (options: TokenFetchOptions, name?: string) => {
            if (options.refresh) {
                // Potential perf issue: Host should optimize and provide non-expired tokens on all critical paths.
                // Exceptions: race conditions around expiration, revoked tokens, host that does not care
                // (fluid-fetcher)
                logger.sendTelemetryEvent({ eventName: "StorageTokenRefresh", hasClaims: !!options.claims });
            }

            return PerformanceEvent.timedExecAsync(
                logger,
                { eventName: `${name || "OdspDocumentService"}_GetToken` },
                async (event) => tokenFetcher(resolvedUrl.siteUrl, options.refresh, options.claims)
                .then((tokenResponse) => {
                    event.end({ fromCache: isTokenFromCache(tokenResponse) });
                    return tokenFromResponse(tokenResponse);
                }));
        };
    }

    private toInstrumentedPushTokenFetcher(
        logger: ITelemetryLogger,
        tokenFetcher: PushTokenFetcher,
    ): (options: TokenFetchOptions) => Promise<string | null> {
        return async (options: TokenFetchOptions) => {
            return PerformanceEvent.timedExecAsync(
                logger,
                { eventName: "GetWebsocketToken" },
                async (event) => tokenFetcher(options.refresh, options.claims).then((tokenResponse) => {
                    event.end({ fromCache: isTokenFromCache(tokenResponse) });
                    return tokenFromResponse(tokenResponse);
                }));
        };
    }

    private toInstrumentedSharingLinkTokenFetcher(
        logger: ITelemetryLogger,
        tokenFetcher: SharingLinkTokenFetcher,
    ): (options: TokenFetchOptions, isForFileDefaultUrl: boolean) => Promise<string | null> {
        return async (options: TokenFetchOptions, isForFileDefaultUrl: boolean) => {
            return PerformanceEvent.timedExecAsync(
                logger,
                { eventName: "GetSharingLinkToken" },
                async (event) => tokenFetcher(isForFileDefaultUrl, options.refresh, options.claims)
                .then((tokenResponse) => {
                    event.end({ fromCache: isTokenFromCache(tokenResponse) });
                    return tokenFromResponse(tokenResponse);
                }));
        };
    }
}
