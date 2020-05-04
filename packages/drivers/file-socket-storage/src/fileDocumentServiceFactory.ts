/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentDeltaConnection,
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { ISummaryTree } from "@microsoft/fluid-protocol-definitions";
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
    public async createDocumentService(fileURL: IResolvedUrl): Promise<IDocumentService> {
        return new FileDocumentService(this.storage, this.deltaStorage, this.deltaConnection);
    }

    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger: ITelemetryLogger,
    ): Promise<IDocumentService> {
        throw new Error("Not implemented");
    }
}
