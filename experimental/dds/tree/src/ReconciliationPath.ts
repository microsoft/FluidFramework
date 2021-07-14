/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Snapshot } from './Snapshot';

/**
 * The path of edits from the snapshot where a change was meant to have been applied to the snapshot where the edit that contains the change
 * is actually applied.
 * The path only contains edits that were successfully applied.
 * This path is always empty for a change that has no concurrent edits.
 */
export interface ReconciliationPath<TChange> {
	/**
	 * The number of edits in the path.
	 */
	readonly length: number;
	/**
	 * Allows access to edit information.
	 * @returns Reconciliation information for the edit at the given `index`.
	 */
	readonly [index: number]: ReconciliationEdit<TChange>;
}

/**
 * An edit in the `ReconciliationPath`.
 */
export interface ReconciliationEdit<TChange> {
	/**
	 * The state before the edit was applied.
	 */
	readonly before: Snapshot;
	/**
	 * The state after the edit was applied.
	 */
	readonly after: Snapshot;
	/**
	 * The number of changes in the edit.
	 */
	readonly length: number;
	/**
	 * Allows access to change information.
	 * @returns Reconciliation information for the change at the given `index`.
	 */
	readonly [index: number]: ReconciliationChange<TChange>;
}

/**
 * A change in the `ReconciliationPath`.
 */
export interface ReconciliationChange<TChange> {
	/**
	 * The resolved change that was applied during the edit.
	 * Resolved changes are guaranteed to be expressed with valid tree locations instead of anchors that need resolution.
	 */
	readonly resolvedChange: TChange;
	/**
	 * The resulting snapshot state from applying the resolved change.
	 */
	readonly after: Snapshot;
}
