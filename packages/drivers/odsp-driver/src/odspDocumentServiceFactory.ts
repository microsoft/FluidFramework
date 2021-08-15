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
import { getSocketIo } from "./getSocketIo";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 */
export class OdspDocumentServiceFactory
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
            async () => getSocketIo(),
            persistedCache,
            hostPolicy,
            socketReferenceKeyPrefix,
        );
    }
}
