/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEditableForest, IForestSubscription } from "../forest";
import { ChangeRebaser } from "../rebase";
import { AnchorSet } from "../tree";

// TODO: move this to changeset directory
export abstract class ProgressiveEditBuilder<TChange> {
    private readonly changes: TChange[] = [];
    constructor(
        private readonly changeFamily: ChangeFamily<unknown, TChange>,
        private readonly deltaReceiver: (delta: Delta) => void,
        private readonly anchorSet: AnchorSet) {}

    /**
     * Subclasses add editing methods which call this with their generated edits.
     */
    protected applyChange(change: TChange): void {
        this.changes.push(change);
        this.changeFamily.rebaser.rebaseAnchors(this.anchorSet, change);
        const delta = this.changeFamily.intoDelta(change);
        this.deltaReceiver(delta);
    }

    /**
     * @returns a copy of the internal change list so far.
     */
    public getChanges(): TChange[] {
        return [...this.changes];
    }
}

// TODO: move this to changeset directory
export interface Delta {
    // TODO: add actual members
    changes: unknown;
}

export interface Checkout<TEditor, TChange> {
    readonly forest: IEditableForest;
    readonly changeFamily: ChangeFamily<TEditor, TChange>;
    submitEdit(edit: TChange): void;
}

/**
 * Keeps a forest in sync with a ProgressiveEditBuilder.
 */
class Transaction<
    TEditor extends ProgressiveEditBuilder<TChange>,
    TChange,
> {
    public readonly editor: TEditor;
    constructor(private readonly forest: IEditableForest, changeFamily: ChangeFamily<TEditor, TChange>) {
        this.editor = changeFamily.buildEditor((delta) => applyDeltaToForest(this.forest, delta), forest.anchors);
    }
}

export function runSynchronousTransaction<TEditor extends ProgressiveEditBuilder<TChange>, TChange>(
    checkout: Checkout<TEditor, TChange>,
    command: (
        forest: IForestSubscription,
        editor: TEditor
    ) => CommandResult,
): CommandResult {
    const t = new Transaction(checkout.forest, checkout.changeFamily);
    const result = command(checkout.forest, t.editor);
    const changes = t.editor.getChanges();
    const edit = checkout.changeFamily.rebaser.compose(...changes);
    if (result === CommandResult.Abort) {
        // Roll back changes
        const inverse = checkout.changeFamily.rebaser.invert(edit);

        // TODO: maybe unify logic to edit forest and its anchors here with that in ProgressiveEditBuilder.
        // TODO: update schema in addition to anchors and tree data (in both places).
        checkout.changeFamily.rebaser.rebaseAnchors(checkout.forest.anchors, inverse);
        applyDeltaToForest(checkout.forest, checkout.changeFamily.intoDelta(inverse));

        return result;
    }

    checkout.submitEdit(edit);

    return result;
}

// Does NOT update anchors.
function applyDeltaToForest(forest: IEditableForest, delta: Delta) {
    // TODO
}

enum CommandResult {
    Abort,
    Apply,
}

// TODO: move this to changeset directory
interface ChangeFamily<TEditor, TChange> {
    buildEditor(deltaReceiver: (delta: Delta) => void, anchorSet: AnchorSet): TEditor;
    intoDelta(change: TChange): Delta;
    // TODO more specific types
    readonly rebaser: ChangeRebaser<TChange, TChange, TChange>;
}
