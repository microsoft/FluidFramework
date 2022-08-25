/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IResolvedUrl } from "@fluidframework/driver-definitions";
import { UsageError } from "@fluidframework/driver-utils";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { createOdspLogger, getOdspResolvedUrl } from "../odspUtils";
import { ICacheAndTracker } from "../epochTracker";
import { OdspDocumentServiceFactoryCore } from "../odspDocumentServiceFactoryCore";
import { LocalOdspDocumentService } from "./localOdspDocumentService";

/**
 * Factory for creating sharepoint document service with a provided snapshot.
 * Use if you don't want to connect to any kind of external/internal storages and want to provide
 * content directly.
 */
export class LocalOdspDocumentServiceFactory extends OdspDocumentServiceFactoryCore {
    private logger: TelemetryLogger | undefined;

    constructor(
        private readonly localSnapshot: Uint8Array | string,
    ) {
        super(
            (_options) => this.throwUnsupportedUsageError("Getting storage token"),
            (_options) => this.throwUnsupportedUsageError("Getting websocket token"),
            () => this.throwUnsupportedUsageError("Getting SocketIO Client"),
        );
    }

    private throwUnsupportedUsageError(unsupportedFuncName: string): never {
        const toThrow = new UsageError(
            `${unsupportedFuncName} is not supported by LocalOdspDocumentServiceFactory`);
        this.logger?.sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
        throw toThrow;
    }

    public createContainer(
        _createNewSummary: ISummaryTree | undefined,
        _createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        _clientIsSummarizer?: boolean,
    ): never {
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
        if (_cacheAndTrackerArg !== undefined) {
            throw new UsageError("Invalid usage. \"_cacheAndTrackerArg\" should not be provided");
        }
        if (_clientIsSummarizer) {
            throw new UsageError("Invalid usage. \"_clientIsSummarizer\" should not be provided");
        }
        this.logger = odspLogger;
        return new LocalOdspDocumentService(getOdspResolvedUrl(resolvedUrl), odspLogger, this.localSnapshot);
    }
}
