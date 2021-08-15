/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import {
    OdspResourceTokenFetchOptions,
    TokenFetcher,
    IPersistedCache,
    HostStoragePolicy,
} from "@fluidframework/odsp-driver-definitions";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";

export class OdspDocumentServiceFactoryWithCodeSplit
    extends OdspDocumentServiceFactoryCore
    implements IDocumentServiceFactory {
    constructor(
        getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
        getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
        persistedCache?: IPersistedCache,
        hostPolicy?: HostStoragePolicy,
        socketReferenceKeyPrefix?: string,
    ) {
        super(
            getStorageToken,
            getWebsocketToken,
            async () => import("./getSocketIo").then((m) => m.getSocketIo()),
            persistedCache,
            hostPolicy,
            socketReferenceKeyPrefix,
        );
    }
}
