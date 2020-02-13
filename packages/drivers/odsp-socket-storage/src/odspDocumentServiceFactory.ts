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
import { FetchWrapper, IFetchWrapper } from "./fetchWrapper";
import { getSocketIo } from "./getSocketIo";
import { OdspCache } from "./odspCache";
import { OdspDocumentService } from "./odspDocumentService";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 */
export class OdspDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid-odsp:";
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
   * @param fileInfoToCreateNewResponseCache - This caches response of new file creation.
   */
    constructor(
        private readonly appId: string,
        private readonly getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        private readonly getWebsocketToken: (refresh: boolean) => Promise<string | null>,
        private readonly logger: ITelemetryBaseLogger,
        private readonly storageFetchWrapper: IFetchWrapper = new FetchWrapper(),
        private readonly deltasFetchWrapper: IFetchWrapper = new FetchWrapper(),
        private readonly odspCache: OdspCache = new OdspCache(),
        private readonly fileInfoToCreateNewResponseCache = new OdspCache(),
    ) { }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        return OdspDocumentService.create(
            this.appId,
            resolvedUrl,
            this.getStorageToken,
            this.getWebsocketToken,
            this.logger,
            this.storageFetchWrapper,
            this.deltasFetchWrapper,
            Promise.resolve(getSocketIo()),
            this.odspCache,
            this.fileInfoToCreateNewResponseCache,
        );
    }
}
