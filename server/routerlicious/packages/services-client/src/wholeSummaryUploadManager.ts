/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISummaryTree,
    IWholeSummaryPayload,
    IWholeSummaryPayloadType,
} from "./storageContracts";
import { IGitManager, ISummaryUploadManager } from "./storage";
import { convertSummaryTreeToWholeSummaryTree } from "./storageUtils";

/**
 * Converts summary to snapshot tree and uploads with single snaphot tree payload.
 */
 export class WholeSummaryUploadManager implements ISummaryUploadManager {
    constructor(
        private readonly manager: IGitManager,
    ) {
    }

    public async writeSummaryTree(
        summaryTree: ISummaryTree,
        parentHandle: string | undefined,
        summaryType: IWholeSummaryPayloadType,
    ): Promise<string> {
        const id = await this.writeSummaryTreeCore(parentHandle, summaryTree, summaryType);
        if (!id) {
            throw new Error(`Failed to write summary tree`);
        }
        return id;
    }

    private async writeSummaryTreeCore(
        parentHandle: string | undefined,
        tree: ISummaryTree,
        type: IWholeSummaryPayloadType,
    ): Promise<string> {
        const snapshotTree = convertSummaryTreeToWholeSummaryTree(
            parentHandle,
            tree,
            "",
        );
        const snapshotPayload: IWholeSummaryPayload = {
            entries: snapshotTree.entries,
            message: undefined,
            sequenceNumber: undefined,
            type,
        };

        return this.manager.createSummary(snapshotPayload).then((response) => response.id);
    }
}
