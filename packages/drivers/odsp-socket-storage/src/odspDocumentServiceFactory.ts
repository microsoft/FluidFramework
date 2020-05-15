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
import { ISummaryTree } from "@microsoft/fluid-protocol-definitions";
import { IOdspResolvedUrl } from "./contracts";
import { FetchWrapper, IFetchWrapper } from "./fetchWrapper";
import { getSocketIo } from "./getSocketIo";
import { ICache, IOdspCache, OdspCache } from "./odspCache";
import { OdspDocumentService } from "./odspDocumentService";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 */
export class OdspDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly isExperimentalDocumentServiceFactory = true;
    public readonly protocolName = "fluid-odsp:";

    private readonly documentsOpened = new Set<string>();
    private readonly cache: IOdspCache;

    public async createContainer(
        createNewSummary: ISummaryTree,
        createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        return OdspDocumentService.createContainer(
            createNewSummary,
            createNewResolvedUrl,
            logger,
            this.cache,
            this.getStorageToken,
            this,
            this.storageFetchWrapper,
        );
    }

    /**
     * @param getStorageToken - function that can provide the storage token for a given site. This is
     * is also referred to as the "VROOM" token in SPO.
     * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
     * referred to as the "Push" token in SPO.
     * @param storageFetchWrapper - if not provided FetchWrapper will be used
     * @param deltasFetchWrapper - if not provided FetchWrapper will be used
     * @param odspCache - This caches response for joinSession.
     */
    constructor(
        private readonly getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        private readonly getWebsocketToken: (refresh: boolean) => Promise<string | null>,
        private readonly storageFetchWrapper: IFetchWrapper = new FetchWrapper(),
        private readonly deltasFetchWrapper: IFetchWrapper = new FetchWrapper(),
        permanentCache?: ICache,
    ) {
        this.cache = new OdspCache(permanentCache);
    }

    /**
     * Create a IDocumentService for a document
     *
     * @param resolvedUrl - the URL to the document to create IDocumentService for
     * @param logger - optional logger to use for the document service that overrides the logger given to the factory
     */
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
            logger,
            this.storageFetchWrapper,
            this.deltasFetchWrapper,
            Promise.resolve(getSocketIo()),
            this.cache,
            isFirstTimeDocumentOpened,
        );
    }
}
