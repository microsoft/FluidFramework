/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { UsageError, EmptyDocumentDeltaStorageService } from "@fluidframework/driver-utils";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { LocalOdspDocumentStorageService } from "./localOdspDocumentStorageManager";

/**
 * IDocumentService implementation that provides explicit snapshot to the document storage service.
 */
export class LocalOdspDocumentService implements IDocumentService {
    public policies = { storageOnly: true };

    constructor(
        private readonly odspResolvedUrl: IOdspResolvedUrl,
        private readonly logger: ITelemetryLogger,
        private readonly localSnapshot: Uint8Array | string,
    ) { }

    public get resolvedUrl(): IResolvedUrl {
        return this.odspResolvedUrl;
    }

    public async connectToStorage(): Promise<IDocumentStorageService> {
        return new LocalOdspDocumentStorageService(
            this.logger,
            this.localSnapshot,
        );
    }

    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return new EmptyDocumentDeltaStorageService();
    }

    public connectToDeltaStream(_client: IClient): never {
        const toThrow = new UsageError("\"connectToDeltaStream\" is not supported by LocalOdspDocumentService");
        this.logger.sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
        throw toThrow;
    }

    public dispose(_error?: any): void {
        // Do nothing
    }
}
