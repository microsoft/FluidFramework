/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@microsoft/fluid-protocol-definitions";
import { ISummaryTracker } from "@microsoft/fluid-runtime-definitions";

/**
 * SummaryTracker is a tree node which allows for deferred
 * snapshot tree access and tracks the latest acked summary
 * reference sequence number.
 */
export class SummaryTracker implements ISummaryTracker {
    public get referenceSequenceNumber() {
        return this._referenceSequenceNumber;
    }

    public async getSnapshotTree(): Promise<ISnapshotTree | undefined> {
        return this._getSnapshotTree();
    }

    private readonly children = new Map<string, SummaryTracker>();

    public refreshLatestSummary(
        referenceSequenceNumber: number,
        getSnapshot: () => Promise<ISnapshotTree | undefined>,
    ) {
        this._referenceSequenceNumber = referenceSequenceNumber;
        this._getSnapshotTree = getSnapshot;

        // Propagate update to all child nodes
        for (const [key, value] of this.children.entries()) {
            value.refreshLatestSummary(referenceSequenceNumber, this.formChildGetSnapshotTree(key));
        }
    }

    public createOrGetChild(key: string): ISummaryTracker {
        const existingTracker = this.children.get(key);
        if (existingTracker) {
            return existingTracker;
        }

        const node = new SummaryTracker(this._referenceSequenceNumber, this.formChildGetSnapshotTree(key));
        this.children.set(key, node);
        return node;
    }

    public constructor(
        private _referenceSequenceNumber: number,
        private _getSnapshotTree: () => Promise<ISnapshotTree | undefined>) {}

    private formChildGetSnapshotTree(key: string): () => Promise<ISnapshotTree | undefined> {
        return async () => (await this._getSnapshotTree())?.trees[key];
    }
}
