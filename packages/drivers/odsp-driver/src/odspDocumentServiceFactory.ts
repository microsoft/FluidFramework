/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import { UsageError } from "@fluidframework/driver-utils";
import {
    OdspResourceTokenFetchOptions,
    TokenFetcher,
    IPersistedCache,
    HostStoragePolicy,
} from "@fluidframework/odsp-driver-definitions";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";
import { getSocketIo } from "./getSocketIo";
import { LocalOdspDocumentService } from "./odspDocumentService";
import { createOdspLogger, getOdspResolvedUrl } from "./odspUtils";
import { ICacheAndTracker } from "./epochTracker";

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
    private logger: TelemetryLogger | undefined;

    constructor(
        private readonly localSnapshot: Uint8Array | string,
    ) {
        super(
            async (_options) => {
                return this.throwUnsupportedUsage("Getting storage token");
            },
            async (_options) => {
                return this.throwUnsupportedUsage("Getting websocket token");
            },
            async () => {
                return this.throwUnsupportedUsage("Getting SocketIO Client");
            },
        );
    }

    private throwUnsupportedUsage<T>(unsupportedFuncName: string): T {
        const toThrow = new UsageError(
            `${unsupportedFuncName} is not supported by LocalOdspDocumentServiceFactory`);
        this.logger?.sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
        throw toThrow;
    }

    public async createContainer(
        _createNewSummary: ISummaryTree | undefined,
        _createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        _clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        const toThrow = new UsageError("\"createContainer\" is not supported by LocalOdspDocumentServiceFactory");
        createOdspLogger(logger).sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
        throw toThrow;
    }

    protected async createDocumentServiceCore(
        resolvedUrl: IResolvedUrl,
        odspLogger: TelemetryLogger,
        _cacheAndTrackerArg?: ICacheAndTracker,
        _clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        assert(_cacheAndTrackerArg === undefined, "Invalid usage. \"_cacheAndTrackerArg\" should not be provided");
        assert(_clientIsSummarizer !== true, "Invalid usage. \"_clientIsSummarizer\" should not be provided");
        this.logger = odspLogger;
        return new LocalOdspDocumentService(getOdspResolvedUrl(resolvedUrl), odspLogger, this.localSnapshot);
    }
}

export function createLocalOdspDocumentServiceFactory(localSnapshot: Uint8Array | string): IDocumentServiceFactory {
    return new LocalOdspDocumentServiceFactory(localSnapshot);
}
