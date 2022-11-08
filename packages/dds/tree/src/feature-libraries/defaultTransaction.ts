/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    ChangeFamily,
    Checkout,
    IEditableForest,
    IForestSubscription,
    ProgressiveEditBuilder,
    RevisionTag,
    TransactionResult,
} from "../core";
import { ForestRepairDataStore } from "./forestRepairDataStore";

/**
 * Keeps a forest in sync with a ProgressiveEditBuilder.
 */
class Transaction<TEditor extends ProgressiveEditBuilder<TChange>, TChange> {
    public readonly editor: TEditor;
    constructor(
        private readonly forest: IEditableForest,
        changeFamily: ChangeFamily<TEditor, TChange>,
    ) {
        let currentRevision = 0;
        const repairStore = new ForestRepairDataStore((revision: RevisionTag) => {
            assert(
                revision === currentRevision,
                "The repair data store should only ask for the current forest state",
            );
            return forest;
        });

        this.editor = changeFamily.buildEditor(
            (delta) => {
                this.forest.applyDelta(delta);
                currentRevision += 1;
            },
            repairStore,
            forest.anchors,
        );
    }
}

export function runSynchronousTransaction<TEditor extends ProgressiveEditBuilder<TChange>, TChange>(
    checkout: Checkout<TEditor, TChange>,
    command: (forest: IForestSubscription, editor: TEditor) => TransactionResult,
): TransactionResult {
    const t = new Transaction(checkout.forest, checkout.changeFamily);
    const result = command(checkout.forest, t.editor);
    const changes = t.editor.getChanges();
    const inverses = changes.map((c) => checkout.changeFamily.rebaser.invert(c));
    const edit = checkout.changeFamily.rebaser.compose(changes.map((c) => c.change));

    // TODO: in the non-abort case, optimize this to not rollback the edit,
    // then reapply it (when the local edit is added) when possible.
    {
        // Roll back changes
        const inverse = checkout.changeFamily.rebaser.compose(inverses);

        // TODO: maybe unify logic to edit forest and its anchors here with that in ProgressiveEditBuilder.
        // TODO: update schema in addition to anchors and tree data (in both places).
        checkout.changeFamily.rebaser.rebaseAnchors(checkout.forest.anchors, inverse);
        checkout.forest.applyDelta(checkout.changeFamily.intoDelta(inverse, t.editor.repairStore));
    }

    if (result === TransactionResult.Apply) {
        checkout.submitEdit(edit);
    }

    return result;
}
