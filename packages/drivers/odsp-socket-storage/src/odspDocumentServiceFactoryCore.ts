/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
    ChildLogger,
    PerformanceEvent,
} from "@fluidframework/common-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { IOdspResolvedUrl, HostStoragePolicy } from "./contracts";
import { FetchWrapper, IFetchWrapper } from "./fetchWrapper";
import { IOdspCache, OdspCache, IPersistedCache } from "./odspCache";
import { OdspDocumentService } from "./odspDocumentService";
import { INewFileInfo } from "./odspUtils";
import { createNewFluidFile } from "./createFile";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 *
 * This constructor should be used by environments that support dynamic imports and that wish
 * to leverage code splitting as a means to keep bundles as small as possible.
 */
export class OdspDocumentServiceFactoryCore implements IDocumentServiceFactory {
    public readonly isExperimentalDocumentServiceFactory = true;
    public readonly protocolName = "fluid-odsp:";

    private readonly documentsOpened = new Set<string>();
    private readonly cache: IOdspCache;

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
        if (!filePath) {
            throw new Error("File path should be provided!!");
        }
        const newFileParams: INewFileInfo = {
            driveId: odspResolvedUrl.driveId,
            siteUrl: odspResolvedUrl.siteUrl,
            filePath,
            filename: odspResolvedUrl.fileName,
        };

        const event = PerformanceEvent.start(
            ChildLogger.create(logger, "OdspDriver"),
            {
                eventName: "CreateNew",
                isWithSummaryUpload: true,
            });

        try {
            odspResolvedUrl = await createNewFluidFile(
                this.getStorageToken,
                newFileParams,
                this.cache,
                this.storageFetchWrapper,
                createNewSummary);
            const props = {
                docId: odspResolvedUrl.hashedDocumentId,
            };

            const docService = this.createDocumentService(odspResolvedUrl, logger);
            event.end(props);
            return docService;
        } catch (error) {
            event.cancel(undefined, error);
            throw error;
        }
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
        private readonly getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        private readonly getWebsocketToken: (refresh: boolean) => Promise<string | null>,
        private readonly storageFetchWrapper: IFetchWrapper = new FetchWrapper(),
        private readonly deltasFetchWrapper: IFetchWrapper = new FetchWrapper(),
        private readonly getSocketIOClient: () => Promise<SocketIOClientStatic>,
        persistedCache?: IPersistedCache,
        private readonly hostPolicy: HostStoragePolicy = {},
    ) {
        this.cache = new OdspCache(persistedCache);
    }

    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        const odspResolvedUrl = resolvedUrl as IOdspResolvedUrl;

        // A hint for driver if document was opened before by this factory
        const docId = odspResolvedUrl.hashedDocumentId;
        const isFirstTimeDocumentOpened = !this.documentsOpened.has(docId);
        this.documentsOpened.add(docId);

        return OdspDocumentService.create(
            resolvedUrl,
            this.getStorageToken,
            this.getWebsocketToken,
            ChildLogger.create(logger, "OdspDriver"),
            this.storageFetchWrapper,
            this.deltasFetchWrapper,
            this.getSocketIOClient(),
            this.cache,
            this.hostPolicy,
            isFirstTimeDocumentOpened,
        );
    }
}
