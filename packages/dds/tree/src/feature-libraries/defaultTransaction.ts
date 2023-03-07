/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	TransactionCheckout,
	IForestSubscription,
	ProgressiveEditBuilder,
	RevisionTag,
	TransactionResult,
	tagChange,
	makeAnonChange,
	mintRevisionTag,
} from "../core";
import { ForestRepairDataStore } from "./forestRepairDataStore";

export function runSynchronousTransaction<TEditor extends ProgressiveEditBuilder<TChange>, TChange>(
	{ forest, changeFamily, submitEdit }: TransactionCheckout<TEditor, TChange>,
	command: (forest: IForestSubscription, editor: TEditor) => TransactionResult,
): TransactionResult {
	// These revision numbers are solely used within the scope of this transaction for the purpose of
	// populating and querying the repair data store. Both the revision numbers and the repair data
	// are scoped to this transaction.
	const revisions: RevisionTag[] = [];
	const repairStore = new ForestRepairDataStore((revision: RevisionTag) => {
		assert(
			revision === revisions[revisions.length - 1],
			0x479 /* The repair data store should only ask for the current forest state */,
		);
		return forest;
	});

	const editor = changeFamily.buildEditor((edit) => {
		const delta = changeFamily.intoDelta(edit);
		const revision = mintRevisionTag();
		revisions.push(revision);
		repairStore.capture(delta, revision);
		forest.applyDelta(delta);
	}, forest.anchors);

	const result = command(forest, editor);
	const changes = editor.getChanges();
	const inverses = changes
		.map((change, index) =>
			changeFamily.rebaser.invert(tagChange(change, revisions[index]), repairStore),
		)
		.reverse();

	// TODO: in the non-abort case, optimize this to not rollback the edit,
	// then reapply it (when the local edit is added) when possible.
	{
		// Roll back changes
		for (const inverse of inverses) {
			// TODO: maybe unify logic to edit forest and its anchors here with that in ProgressiveEditBuilder.
			// TODO: update schema in addition to anchors and tree data (in both places).
			changeFamily.rebaser.rebaseAnchors(forest.anchors, inverse);
			forest.applyDelta(changeFamily.intoDelta(inverse));
		}
	}

	if (result === TransactionResult.Apply) {
		// Using anonymous changes makes it impossible to chronologically order them during composition.
		// Such an ordering is needed when composing/squashing inverse changes with other changes, which is currently
		// not expected to happen in transactions but that could change in the future.
		const anonChanges = changes.map((c) => makeAnonChange(c));
		const edit = changeFamily.rebaser.compose(anonChanges);
		submitEdit(edit);
	}

	return result;
}
