/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";
import {
    IDocumentStorageService,
    ISummaryContext,
} from "@fluidframework/driver-definitions";
import { combineAppAndProtocolSummary } from "@fluidframework/driver-utils";
import {
    ISummaryTree,
} from "@fluidframework/protocol-definitions";

export class ProtocolTreeStorageService implements IDocumentStorageService, IDisposable {
    constructor(
        private readonly internalStorageService: IDocumentStorageService & IDisposable,
        private readonly generateProtocolTree: () => ISummaryTree,
    ) {
    }
    public get policies() {
        return this.internalStorageService.policies;
    }
    public get repositoryUrl() {
        return this.internalStorageService.repositoryUrl;
    }
    public get disposed() {
        return this.internalStorageService.disposed;
    }

    getSnapshotTree = this.internalStorageService.getSnapshotTree.bind(this.internalStorageService);
    getVersions = this.internalStorageService.getVersions.bind(this.internalStorageService);
    createBlob = this.internalStorageService.createBlob.bind(this.internalStorageService);
    readBlob = this.internalStorageService.readBlob.bind(this.internalStorageService);
    downloadSummary = this.internalStorageService.downloadSummary.bind(this.internalStorageService);
    dispose = this.internalStorageService.dispose.bind(this.internalStorageService);

    async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return this.internalStorageService.uploadSummaryWithContext(
            combineAppAndProtocolSummary(summary, this.generateProtocolTree()),
            context,
        );
    }
}
