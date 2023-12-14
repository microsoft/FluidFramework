/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeInternal } from './persisted-types';
import { TransactionView } from './RevisionView';
import { TreeView } from './TreeView';

/**
 * The path of edits from the revision view where a change was meant to have been applied to the view where the edit that contains the
 * change is actually applied.
 * The path only contains edits that were successfully applied.
 * This path is always empty for a change that has no concurrent edits.
 * @alpha
 */
export interface ReconciliationPath {
	/**
	 * The number of edits in the path.
	 */
	readonly length: number;
	/**
	 * Allows access to edit information.
	 * @returns Reconciliation information for the edit at the given `index`.
	 */
	readonly [index: number]: ReconciliationEdit;
}

/**
 * An edit in the `ReconciliationPath`.
 * @alpha
 */
export interface ReconciliationEdit {
	/**
	 * The state before the edit was applied.
	 */
	readonly before: TreeView;
	/**
	 * The state after the edit was applied.
	 */
	readonly after: TreeView;
	/**
	 * The number of changes in the edit.
	 */
	readonly length: number;
	/**
	 * Allows access to change information.
	 * @returns Reconciliation information for the change at the given `index`.
	 */
	readonly [index: number]: ReconciliationChange;
}

/**
 * A change in the `ReconciliationPath`.
 * @alpha
 */
export interface ReconciliationChange {
	/**
	 * The resolved change that was applied during the edit.
	 * Resolved changes are guaranteed to be expressed with valid tree locations instead of anchors that need resolution.
	 */
	readonly resolvedChange: ChangeInternal;
	/**
	 * The resulting view from applying the resolved change.
	 */
	readonly after: TransactionView;
}
