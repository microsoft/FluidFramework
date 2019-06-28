/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IPragueResolvedUrl, IResolvedUrl } from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { parse } from "url";
import { ISequencedDeltaOpMessage, ISocketStorageDiscovery } from "./contracts";
import { HttpGetter, IGetter } from "./Getter";
import { OdspDocumentService } from "./OdspDocumentService";

export interface IOdspSnapshot {
    id: string;
    sha: string;
    trees: resources.ITree[];
    blobs: resources.IBlob[];
    ops: ISequencedDeltaOpMessage[];
}

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 */
export class OdspDocumentServiceFactory implements IDocumentServiceFactory {
    private readonly storageGetter: IGetter;
    private readonly deltasGetter: IGetter;

    /**
     * @param appId - app id used for telemetry for network requests
     * @param snapshot - snapshot
     * @param socketStorageDiscovery - the initial JoinSession response
     * @param joinSession - function to invoke to re-run JoinSession
     * @param storageGetter - if not provided httpgetter will be used
     * @param deltasGetter - if not provided httpgetter will be used
     */
    constructor(
        private readonly appId: string,
        private readonly snapshot?: Promise<IOdspSnapshot | undefined>,
        private readonly socketStorageDiscoveryP?: Promise<ISocketStorageDiscovery>,
        private readonly joinSession?: () => Promise<ISocketStorageDiscovery>,
        storageGetter?: IGetter,
        deltasGetter?: IGetter,
        private readonly bypassSnapshot = false,
    ) {
        this.storageGetter = storageGetter || new HttpGetter();
        this.deltasGetter = deltasGetter || new HttpGetter();
    }

    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (this.socketStorageDiscoveryP) {
            return this.socketStorageDiscoveryP.then(
                (socketStorageDiscovery) =>
                    new OdspDocumentService(
                        this.appId,
                        this.storageGetter,
                        this.deltasGetter,
                        socketStorageDiscovery,
                        this.snapshot,
                        this.joinSession,
                    ),
            );
        }
        if (resolvedUrl.type !== "prague") {
            return Promise.reject("Only Prague components currently supported in the OdspDocumentServiceFactory");
        }

        const pragueResolvedUrl = resolvedUrl as IPragueResolvedUrl;
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
            this.storageGetter,
            this.deltasGetter,
            socketStorageDiscoveryFromURL,
        ));
    }
}
