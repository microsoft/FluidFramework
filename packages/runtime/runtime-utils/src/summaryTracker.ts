/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTracker } from "@fluidframework/runtime-definitions";

/**
 * SummaryTracker is a tree node which allows for deferred
 * snapshot tree access and tracks the latest acked summary
 * reference sequence number.
 */
export class SummaryTracker implements ISummaryTracker {
    /**
     * The reference sequence number of the most recent acked summary.
     */
    public get referenceSequenceNumber() {
        return this._referenceSequenceNumber;
    }

    /**
     * The latest sequence number of change to this node or subtree.
     */
    public get latestSequenceNumber() {
        return this._latestSequenceNumber;
    }

    /**
     * Gets the Id to use when summarizing.
     * This will be the full path to the node.
     */
    public async getId(): Promise<string | undefined> {
        if (this._latestSequenceNumber > this._referenceSequenceNumber) {
            // If the latest sequence number exceeds the reference sequence number
            // of the last acked summary, this indicates a change, and so we cannot
            // reused the id.
            return undefined;
        }
        return this._fullPath;
    }

    private readonly children = new Map<string, SummaryTracker>();

    public refreshLatestSummary(
        referenceSequenceNumber: number,
    ) {
        this._referenceSequenceNumber = referenceSequenceNumber;

        // Propagate update to all child nodes
        for (const [, value] of this.children.entries()) {
            value.refreshLatestSummary(referenceSequenceNumber);
        }
    }

    public updateLatestSequenceNumber(latestSequenceNumber: number): void {
        this._latestSequenceNumber = latestSequenceNumber;
    }

    public createOrGetChild(key: string, latestSequenceNumber: number): SummaryTracker {
        const existingChild = this.children.get(key);
        if (existingChild !== undefined) {
            return existingChild;
        }

        const newChild = new SummaryTracker(
            `${this._fullPath}/${encodeURIComponent(key)}`,
            this._referenceSequenceNumber,
            latestSequenceNumber);

        this.children.set(key, newChild);
        return newChild;
    }

    public getChild(key: string): ISummaryTracker | undefined {
        return this.children.get(key);
    }

    public constructor(
        private readonly _fullPath: string,
        private _referenceSequenceNumber: number,
        private _latestSequenceNumber: number) { }
}
