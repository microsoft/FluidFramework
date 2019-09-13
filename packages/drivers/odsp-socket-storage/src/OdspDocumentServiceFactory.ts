/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IFluidResolvedUrl, IResolvedUrl } from "@prague/protocol-definitions";
import { parse } from "url";
import { IOdspSnapshot, ISocketStorageDiscovery } from "./contracts";
import { FetchWrapper, IFetchWrapper } from "./fetchWrapper";
import { OdspDocumentService } from "./OdspDocumentService";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 */
export class OdspDocumentServiceFactory implements IDocumentServiceFactory {

    public readonly protocolName = "prague-odsp:";
    /**
     * @param appId - app id used for telemetry for network requests
     * @param snapshot - optional promise to prefetched latest snapshot. It will query the
     * server if the promise is not provide. If the promise resolves to null,
     * it will assume that there are no snapshot on the server and skip the query
     * @param socketStorageDiscovery - the initial JoinSession response
     * @param joinSession - function to invoke to re-run JoinSession
     * @param storageFetchWrapper - if not provided FetchWrapper will be used
     * @param deltasFetchWrapper - if not provided FetchWrapper will be used
     */
    constructor(
        private readonly appId: string,
        private readonly snapshot?: Promise<IOdspSnapshot | undefined>,
        private readonly socketStorageDiscoveryP?: Promise<ISocketStorageDiscovery>,
        private readonly joinSession?: () => Promise<ISocketStorageDiscovery>,
        private readonly storageFetchWrapper: IFetchWrapper = new FetchWrapper(),
        private readonly deltasFetchWrapper: IFetchWrapper = new FetchWrapper(),
        private readonly bypassSnapshot = false,
    ) {
    }

    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (this.socketStorageDiscoveryP) {
            return this.socketStorageDiscoveryP.then(
                (socketStorageDiscovery) =>
                    new OdspDocumentService(
                        this.appId,
                        socketStorageDiscovery.id,
                        socketStorageDiscovery.snapshotStorageUrl,
                        this.storageFetchWrapper,
                        this.deltasFetchWrapper,
                        socketStorageDiscovery,
                        this.snapshot,
                        this.joinSession,
                    ),
            );
        }

        if (resolvedUrl.type !== "prague") {
            return Promise.reject("Only Fluid components currently supported in the OdspDocumentServiceFactory");
        }

        const pragueResolvedUrl = resolvedUrl as IFluidResolvedUrl;
        const storageUrl = pragueResolvedUrl.endpoints.storageUrl;
        const deltaStorageUrl = pragueResolvedUrl.endpoints.deltaStorageUrl;
        const ordererUrl = pragueResolvedUrl.endpoints.ordererUrl;

        const invalidSnapshotUrl = !storageUrl && !this.bypassSnapshot;
        if (invalidSnapshotUrl || !deltaStorageUrl || !ordererUrl) {
            return Promise.reject(`All endpoints urls must be provided.`
                + `[storageUrl:${storageUrl}][deltaStorageUrl:${deltaStorageUrl}][ordererUrl:${ordererUrl}]`);
        }

        const storageToken = pragueResolvedUrl.tokens.storageToken;
        const socketToken = pragueResolvedUrl.tokens.socketToken;
        if (!storageToken || !socketToken) {
            return Promise.reject(`All tokens must be provided. [storageToken:${storageToken}][socketToken:${socketToken}]`);
        }

        const parsedUrl = parse(pragueResolvedUrl.url);
        if (!parsedUrl.pathname) {
            return Promise.reject(`Couldn't parse resolved url. [url:${pragueResolvedUrl.url}]`);
        }

        const [, tenantId, documentId] = parsedUrl.pathname.split("/");
        if (!documentId || !tenantId) {
            return Promise.reject(`Couldn't parse documentId and/or tenantId. [url:${pragueResolvedUrl.url}]`);
        }

        const socketStorageDiscoveryFromURL: ISocketStorageDiscovery = {
            deltaStorageUrl,
            deltaStreamSocketUrl: ordererUrl,
            id: documentId,
            snapshotStorageUrl: storageUrl,
            socketToken,
            storageToken,
            tenantId,
        };
        return Promise.resolve(new OdspDocumentService(
            this.appId,
            documentId,
            storageUrl,
            this.storageFetchWrapper,
            this.deltasFetchWrapper,
            socketStorageDiscoveryFromURL,
        ));
    }
}
