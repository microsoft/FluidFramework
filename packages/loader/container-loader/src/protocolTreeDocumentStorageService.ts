/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorageService,
    ISummaryContext,
} from "@fluidframework/driver-definitions";
import {
    ISummaryTree,
} from "@fluidframework/protocol-definitions";

export class ProtocolTreeStorageService implements IDocumentStorageService {
    constructor(
        private readonly internalStorageService: IDocumentStorageService,
        private readonly generateProtocolTree: () => ISummaryTree,
    ) {
    }
    public get policies() {
        return this.internalStorageService.policies;
    }
    public get repositoryUrl() {
        return this.internalStorageService.repositoryUrl;
    }

    getSnapshotTree = this.internalStorageService.getSnapshotTree.bind(this.internalStorageService);
    getVersions = this.internalStorageService.getVersions.bind(this.internalStorageService);
    write = this.internalStorageService.write.bind(this.internalStorageService);
    createBlob = this.internalStorageService.createBlob.bind(this.internalStorageService);
    readBlob = this.internalStorageService.readBlob.bind(this.internalStorageService);
    downloadSummary = this.internalStorageService.downloadSummary.bind(this.internalStorageService);

    async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        summary.tree[".protocol"] = this.generateProtocolTree();
        return this.internalStorageService.uploadSummaryWithContext(
            summary,
            context,
        );
    }
}
