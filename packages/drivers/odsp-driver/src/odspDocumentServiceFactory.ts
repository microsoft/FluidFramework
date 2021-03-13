/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { HostStoragePolicy } from "./contracts";
import { IPersistedCache } from "./odspCache";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";
import { getSocketIo } from "./getSocketIo";
import { OdspResourceTokenFetchOptions, TokenFetcher } from "./tokenFetch";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 */
export class OdspDocumentServiceFactory
    extends OdspDocumentServiceFactoryCore
    implements IDocumentServiceFactory {
    constructor(
        getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
        getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions>,
        persistedCache?: IPersistedCache,
        hostPolicy?: HostStoragePolicy,
    ) {
        super(
            getStorageToken,
            getWebsocketToken,
            async () => getSocketIo(),
            persistedCache,
            hostPolicy,
        );
    }
}
