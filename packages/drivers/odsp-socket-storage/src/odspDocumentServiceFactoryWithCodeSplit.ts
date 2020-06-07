/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { FetchWrapper, IFetchWrapper } from "./fetchWrapper";
import { IPersistedCache } from "./odspCache";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";
import { HostStoragePolicy } from "./contracts";

export class OdspDocumentServiceFactoryWithCodeSplit
    extends OdspDocumentServiceFactoryCore
    implements IDocumentServiceFactory {
    constructor(
        getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
        getWebsocketToken: (refresh: boolean) => Promise<string | null>,
        storageFetchWrapper: IFetchWrapper = new FetchWrapper(),
        deltasFetchWrapper: IFetchWrapper = new FetchWrapper(),
        persistedCache?: IPersistedCache,
        hostPolicy?: HostStoragePolicy,
    ) {
        super(
            getStorageToken,
            getWebsocketToken,
            storageFetchWrapper,
            deltasFetchWrapper,
            async () => import("./getSocketIo").then((m) => m.getSocketIo()),
            persistedCache,
            hostPolicy,
        );
    }
}
