/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentDeltaConnection,
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { FileDeltaStorageService } from "./fileDeltaStorageService";
import { FileDocumentService } from "./fileDocumentService";

/**
 * Factory for creating the file document service. Use this if you want to
 * use the local file storage as underlying storage.
 */
export class FileDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid-file:";
    constructor(
        private readonly storage: IDocumentStorageService,
        private readonly deltaStorage: FileDeltaStorageService,
        private readonly deltaConnection: IDocumentDeltaConnection) {
    }

    /**
     * Creates the file document service if the path exists.
     *
     * @param fileURL - Path of directory containing ops/snapshots.
     * @returns file document service.
     */
    public async createDocumentService(
        fileURL: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        return new FileDocumentService(this.storage, this.deltaStorage, this.deltaConnection);
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        throw new Error("Not implemented");
    }
}
