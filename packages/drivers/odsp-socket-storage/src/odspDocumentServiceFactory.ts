/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { FetchWrapper, IFetchWrapper } from "./fetchWrapper";
import { IPersistedCache } from "./odspCache";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";
import { getSocketIo } from "./getSocketIo";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 */
export class OdspDocumentServiceFactory
    extends OdspDocumentServiceFactoryCore
    implements IDocumentServiceFactory
{
    constructor(
        getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        getWebsocketToken: (refresh: boolean) => Promise<string | null>,
        storageFetchWrapper: IFetchWrapper = new FetchWrapper(),
        deltasFetchWrapper: IFetchWrapper = new FetchWrapper(),
        persistedCache?: IPersistedCache,
        snapshotOptions?: {[key: string]: number},
    ) {
        super(
            getStorageToken,
            getWebsocketToken,
            storageFetchWrapper,
            deltasFetchWrapper,
            async () => getSocketIo(),
            persistedCache,
            snapshotOptions,
        );
    }
}
