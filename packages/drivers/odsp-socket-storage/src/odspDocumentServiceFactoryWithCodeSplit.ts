/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryBaseLogger } from "@microsoft/fluid-common-definitions";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { IOdspResolvedUrl } from "./contracts";
import { FetchWrapper, IFetchWrapper } from "./fetchWrapper";
import { ICache, IOdspCache, OdspCache } from "./odspCache";
import { OdspDocumentService } from "./odspDocumentService";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 *
 * This constructor should be used by environments that support dynamic imports and that wish
 * to leverage code splitting as a means to keep bundles as small as possible.
 */
export class OdspDocumentServiceFactoryWithCodeSplit implements IDocumentServiceFactory {
    public readonly protocolName = "fluid-odsp:";

    private readonly documentsOpened = new Set<string>();
    private readonly cache: IOdspCache;

    /**
   * @param appId - app id used for telemetry for network requests.
   * @param getStorageToken - function that can provide the storage token for a given site. This is
   * is also referred to as the "VROOM" token in SPO.
   * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
   * referred to as the "Push" token in SPO.
   * @param logger - a logger that can capture performance and diagnostic information
   * @param storageFetchWrapper - if not provided FetchWrapper will be used
   * @param deltasFetchWrapper - if not provided FetchWrapper will be used
   * @param odspCache - This caches response for joinSession.
   */
    constructor(
        private readonly appId: string,
        private readonly getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        private readonly getWebsocketToken: (refresh: boolean) => Promise<string | null>,
        private readonly logger: ITelemetryBaseLogger,
        private readonly storageFetchWrapper: IFetchWrapper = new FetchWrapper(),
        private readonly deltasFetchWrapper: IFetchWrapper = new FetchWrapper(),
        permanentCache?: ICache,
        private readonly createNewFlag: boolean = false,
    ) {
        this.cache = new OdspCache(permanentCache);
    }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        const odspResolvedUrl = resolvedUrl as IOdspResolvedUrl;

        // A hint for driver if document was opened before by this factory
        const docId = odspResolvedUrl.hashedDocumentId;
        const isFirstTimeDocumentOpened = !this.documentsOpened.has(docId);
        this.documentsOpened.add(docId);

        return OdspDocumentService.create(
            this.appId,
            resolvedUrl,
            this.getStorageToken,
            this.getWebsocketToken,
            this.logger,
            this.storageFetchWrapper,
            this.deltasFetchWrapper,
            import("./getSocketIo").then((m) => m.getSocketIo()),
            this.cache,
            isFirstTimeDocumentOpened,
            this.createNewFlag,
        );
    }
}
