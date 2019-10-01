/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@microsoft/fluid-protocol-definitions";

/**
 * Responsible for tracking changes related to base summary tree usage.
 * It basically tracks 2 things: whether there have been any changes since
 * the base summary, and whether the base summary has been refreshed.
 * Only if both things are true can the baseId be reused during summarization.
 */
export class SummaryTracker {
    public get unchangedSinceBase() { return this._unchangedSinceBase; }
    public get baseIsLatest() { return this._baseIsLatest; }
    public get baseTree() { return this._baseSnapshotTree; }

    private _unchangedSinceBase = true;
    private _baseIsLatest = false;
    private _baseSnapshotTree: ISnapshotTree | null = null;

    /**
     * Gets the baseId if it can be reused during summarization;
     * returns null otherwise
     */
    public getBaseId(): string | null {
        if (this._unchangedSinceBase && this._baseIsLatest && this._baseSnapshotTree) {
            return this._baseSnapshotTree.id;
        } else {
            return null;
        }
    }

    /**
     * Indicate that a change has occurred since the base
     */
    public trackChange() {
        if (this._unchangedSinceBase) {
            this._unchangedSinceBase = false;
        }
    }

    /**
     * Resets to initial state: base is not latest, but there are no changes
     */
    public resetChangeTracker() {
        this._unchangedSinceBase = true;
        this._baseIsLatest = false;
    }

    /**
     * Sets the base summary and marks that it is latest
     * @param snapshot - base summary to set
     */
    public refreshBaseSummary(snapshot: ISnapshotTree | null) {
        this._baseSnapshotTree = snapshot;
        this._baseIsLatest = true;
    }
}
