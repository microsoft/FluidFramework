/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag, TaggedChange } from "../rebase";
import { ReadonlyRepairDataStore, RepairDataStore } from "../repair";
import { AnchorSet, Delta } from "../tree";
import { brand } from "../util";
import { ChangeFamily } from "./changeFamily";

export interface ProgressiveEditBuilder<TChange> {
    /**
     * @returns a copy of the internal change list so far.
     */
    getChanges(): TaggedChange<TChange>[];

    readonly repairStore: ReadonlyRepairDataStore;
}

export abstract class ProgressiveEditBuilderBase<TChange>
    implements ProgressiveEditBuilder<TChange>
{
    private readonly changes: TaggedChange<TChange>[] = [];
    constructor(
        private readonly changeFamily: ChangeFamily<unknown, TChange>,
        private readonly deltaReceiver: (delta: Delta.Root) => void,
        public readonly repairStore: RepairDataStore,
        private readonly anchorSet: AnchorSet,
    ) {}

    /**
     * Subclasses add editing methods which call this with their generated edits.
     *
     * @sealed
     */
    protected applyChange(change: TChange): void {
        const revision: RevisionTag = brand(this.changes.length);
        this.changes.push({
            revision,
            change,
        });
        this.changeFamily.rebaser.rebaseAnchors(this.anchorSet, change);
        const delta = this.changeFamily.intoDelta(change, this.repairStore);
        this.repairStore.capture({
            revision,
            changes: delta,
        });
        this.deltaReceiver(delta);
    }

    /**
     * {@inheritDoc (ProgressiveEditBuilder:interface).getChanges}
     * @sealed
     */
    public getChanges(): TaggedChange<TChange>[] {
        return [...this.changes];
    }
}
