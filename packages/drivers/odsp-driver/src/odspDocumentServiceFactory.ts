/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import {
    OdspResourceTokenFetchOptions,
    TokenFetcher,
    IPersistedCache,
    HostStoragePolicy,
} from "@fluidframework/odsp-driver-definitions";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";
import { getSocketIo } from "./getSocketIo";
import { LocalOdspDocumentService } from "./odspDocumentService";
import { createOdspLogger } from "./odspUtils";
import { ICacheAndTracker } from "./epochTracker";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 */
export class OdspDocumentServiceFactory extends OdspDocumentServiceFactoryCore {
    constructor(
        getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
        getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
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

export class LocalOdspDocumentServiceFactory extends OdspDocumentServiceFactoryCore {
    constructor(
        private readonly fluidFile: Uint8Array | string,
    ) {
        super(
            async (_options) => { return null; }, // TODO
            undefined,
            async () => getSocketIo(), // TODO
            undefined,
            undefined, // TODO
        );
    }

    public async createContainer(
        _createNewSummary: ISummaryTree | undefined,
        _createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        _clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        const odspLogger = createOdspLogger(logger);

        return this.createDocumentServiceCore(
            // TODO: should use the IOdspResolvedUrl interface
            {
                type: "web",
                data: "sampledata",
            },
            odspLogger,
        );
    }

    protected async createDocumentServiceCore(
        resolvedUrl: IResolvedUrl,
        odspLogger: TelemetryLogger,
        _cacheAndTrackerArg?: ICacheAndTracker,
        _clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        // TODO: We should potentially provide the implementation for resolvedUrl here
        return new LocalOdspDocumentService(resolvedUrl, odspLogger, this.fluidFile);
    }
}

export function sampleFuncName(fluidFile: Uint8Array | string): IDocumentServiceFactory {
    return new LocalOdspDocumentServiceFactory(fluidFile);
}
