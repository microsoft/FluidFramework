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

    // back-compat: 0.14 uploadSummary
    public async getSnapshotTree(): Promise<ISnapshotTree | undefined> {
        return this._getSnapshotTree();
    }

    /**
     * Gets the Id to use when summarizing.
     * When useContext is true, this will be the full path to the node.
     * When useContext is false, this will fetch the
     * id from the previous snapshot tree.
     */
    public async getId(): Promise<string | undefined> {
        if (this._latestSequenceNumber > this._referenceSequenceNumber) {
            // If the latest sequence number exceeds the reference sequence number
            // of the last acked summary, this indicates a change, and so we cannot
            // reused the id.
            return undefined;
        }
        if (this.useContext === true) {
            return this._fullPath;
        } else {
            // back-compat: 0.14 uploadSummary
            const tree = await this.getSnapshotTree();
            const id = tree?.id ?? undefined;
            if (id === undefined) {
                throw Error("Expected to find parent snapshot tree with id.");
            }
            return id;
        }
    }

    private readonly children = new Map<string, SummaryTracker>();

    // back-compat: 0.14 uploadSummary
    private readonly refreshHandlers: (() => Promise<void>)[] = [];

    // only async for back-compat: 0.14 uploadSummary
    public async refreshLatestSummary(
        referenceSequenceNumber: number,
        getSnapshot: () => Promise<ISnapshotTree | undefined>,
    ) {
        this._referenceSequenceNumber = referenceSequenceNumber;
        this._getSnapshotTree = getSnapshot;

        // back-compat: 0.14 uploadSummary
        for (const handler of this.refreshHandlers) {
            await handler();
        }

        // Propagate update to all child nodes
        for (const [key, value] of this.children.entries()) {
            await value.refreshLatestSummary(referenceSequenceNumber, this.formChildGetSnapshotTree(key));
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
            this.useContext,
            `${this._fullPath}/${encodeURIComponent(key)}`,
            this._referenceSequenceNumber,
            latestSequenceNumber,
            this.formChildGetSnapshotTree(key));

        this.children.set(key, newChild);
        return newChild;
    }

    public constructor(
        public readonly useContext: boolean,
        private readonly _fullPath: string,
        private _referenceSequenceNumber: number,
        private _latestSequenceNumber: number,
        private _getSnapshotTree: () => Promise<ISnapshotTree | undefined>) {}

    // back-compat: 0.14 uploadSummary
    public addRefreshHandler(handler: () => Promise<void>): void {
        this.refreshHandlers.push(handler);
    }

    private formChildGetSnapshotTree(key: string): () => Promise<ISnapshotTree | undefined> {
        return async () => (await this._getSnapshotTree())?.trees[key];
    }
}
