/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@microsoft/fluid-protocol-definitions";

/**
 * Initial - this is the initial state of the tracker, which means that
 * no changes have come in, but the base summary has not been set yet.
 * Invalid - when a change comes in, the baseId cannot be used.
 * Valid - no changes have come in since the last reset, and the
 * base summary has been set.
 */
export enum SummaryTrackerState {
    Initial = 0,
    Invalid = -1,
    Valid = 1,
}

/**
 * Responsible for tracking changes related to base summary tree usage.
 * It basically tracks 2 things: whether there have been any changes since
 * the base summary, and whether the base summary has been refreshed.
 * Only if both things are true can the baseId be reused during summarization.
 * This is represented by 3 states in the SummaryTrackerState enum.
 */
export class SummaryTracker {
    public get state() { return this._state; }
    public get baseTree() { return this._baseSnapshotTree; }

    private _state: SummaryTrackerState = SummaryTrackerState.Initial;
    private _baseSnapshotTree: ISnapshotTree | null = null;

    /**
     * Gets the baseId if it can be reused during summarization;
     * returns null otherwise
     */
    public getBaseId(): string | null {
        if (this._state === SummaryTrackerState.Valid && this._baseSnapshotTree && this._baseSnapshotTree.id) {
            return this._baseSnapshotTree.id;
        } else {
            return null;
        }
    }

    /**
     * Indicate that a change has occurred since the base.
     * Set state to invalid.
     */
    public invalidate() {
        if (this._state !== SummaryTrackerState.Invalid) {
            this._state = SummaryTrackerState.Invalid;
        }
    }

    /**
     * Resets state to initial.
     */
    public reset() {
        if (this._state !== SummaryTrackerState.Initial) {
            this._state = SummaryTrackerState.Initial;
        }
    }

    /**
     * Sets the base summary tree.
     * Set state to valid if not invalid.
     * @param snapshot - base summary to set
     */
    public setBaseTree(snapshot: ISnapshotTree | null) {
        this._baseSnapshotTree = snapshot;
        if (this._state === SummaryTrackerState.Initial) {
            this._state = SummaryTrackerState.Valid;
        }
    }
}
