/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { IPersistedCache } from "./odspCache";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";
import { HostStoragePolicy } from "./contracts";
import { StorageTokenFetcher, PushTokenFetcher } from "./tokenFetch";

export class OdspDocumentServiceFactoryWithCodeSplit
    extends OdspDocumentServiceFactoryCore
    implements IDocumentServiceFactory {
    constructor(
        getStorageToken: StorageTokenFetcher,
        getWebsocketToken: PushTokenFetcher,
        persistedCache?: IPersistedCache,
        hostPolicy?: HostStoragePolicy,
        usePostForTreesLatest: boolean = false,
    ) {
        super(
            getStorageToken,
            getWebsocketToken,
            async () => import("./getSocketIo").then((m) => m.getSocketIo()),
            persistedCache,
            hostPolicy,
            usePostForTreesLatest,
        );
    }
}
