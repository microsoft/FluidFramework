/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { RevertibleAlpha, TreeBranchAlpha } from "@fluidframework/tree/internal";

import { areSetsDisjoint } from "./utilities.js";

/**
 * An undo/redo manager that supports optional scoping based on transaction labels.
 *
 * @remarks
 * When a label is provided to `undo` / `redo`, the operation targets the most recent commit
 * whose label set contains that label, skipping commits that do not match. When no label is
 * provided, the operation is global and targets the most recent commit regardless of labels.
 *
 * **Redo invalidation:** when a new user commit arrives, redo entries whose label sets overlap
 * with the new commit's labels are discarded. An anonymous commit (no labels) discards only
 * anonymous redo entries; labeled redo entries are preserved. This ensures that misc. edits do not invalidate
 * editor-specific redo stacks, while still guaranteeing that redo operations never reapply commits that have been
 * semantically "overridden" by a new commit with overlapping labels.
 *
 * All operations are silent no-ops when there is nothing to undo/redo matching the label policy.
 *
 * **Nested-transaction labels are not tracked.** SharedTree supports nesting one `runTransaction`
 * call inside another. When a nested transaction carries a label, that label appears as a child
 * node in the commit's label tree rather than at the root level. Only root-level symbol labels are
 * extracted from each commit; labels belonging to inner nested transactions are ignored. As a
 * result, inner labels cannot be used with the label-filtered overloads of `undo`, `redo`,
 * `canUndo`, or `canRedo`. The outer transaction's label, if present, is tracked and covers the
 * entire nested operation as one atomic undo/redo unit.
 *
 * @example Scoped undo/redo with two independent editors
 * ```typescript
 * const titleLabel = Symbol("title-editor");
 * const bodyLabel  = Symbol("body-editor");
 * const manager = createUndoRedo(treeView);
 *
 * // Each editor tags its commits with its own label.
 * treeView.runTransaction(() => { root.title = "Draft"; }, { label: titleLabel });
 * treeView.runTransaction(() => { root.body  = "Hello"; }, { label: bodyLabel });
 *
 * // Undo only the body editor's last change; the title change is unaffected.
 * manager.undo(bodyLabel);
 * console.log(manager.canRedo(bodyLabel));  // true
 * console.log(manager.canRedo(titleLabel)); // false
 * ```
 *
 * @example Nested transactions — inner label is not tracked
 * ```typescript
 * const outerLabel = Symbol("outer");
 * const innerLabel = Symbol("inner");
 *
 * treeView.runTransaction(() => {
 *     treeView.runTransaction(() => {
 *         root.value = 1;
 *     }, { label: innerLabel }); // innerLabel is NOT tracked
 * }, { label: outerLabel });     // outerLabel IS tracked
 *
 * console.log(manager.canUndo(outerLabel)); // true
 * console.log(manager.canUndo(innerLabel)); // false — inner labels are not extracted
 * ```
 *
 * @internal
 */
export interface UndoRedo {
	/**
	 * Undoes the most recent commit whose label set contains `label`.
	 *
	 * @param label - The label to match against. If omitted, undoes the most recent commit
	 * regardless of labels.
	 * This method no-ops if there is nothing to undo matching the label policy.
	 *
	 * @see {@link UndoRedo.canUndo}
	 */
	undo(label?: unknown): void;

	/**
	 * Redoes the most recent undone commit whose label set contains `label`.
	 *
	 * @param label - The label to match against. If omitted, redoes the most recent undone commit
	 * regardless of labels.
	 * This method no-ops if there is nothing to redo matching the label policy.
	 *
	 * @see {@link UndoRedo.canRedo}
	 */
	redo(label?: unknown): void;

	/**
	 * Returns true if there is at least one commit available to undo whose label set contains
	 * `label`.
	 *
	 * @param label - The label to check for. If omitted, checks the global undo stack.
	 *
	 * @see {@link UndoRedo.undo}
	 */
	canUndo(label?: unknown): boolean;

	/**
	 * Returns true if there is at least one commit available to redo whose label set contains
	 * `label`.
	 *
	 * @param label - The label to check for. If omitted, checks the global redo stack.
	 *
	 * @see {@link UndoRedo.redo}
	 */
	canRedo(label?: unknown): boolean;

	/**
	 * Releases the manager's subscription to the branch and disposes all tracked revertibles.
	 *
	 * @remarks
	 * After calling `dispose()`:
	 * - `canUndo()` and `canRedo()` return `false`.
	 * - `undo()` and `redo()` are silent no-ops.
	 * - Calling `dispose()` again is safe and has no effect.
	 */
	dispose(): void;
}


/**
 * One entry on the undo or redo stack, pairing a revertible with its commit's label set.
 */
interface StackEntry {
	/**
	 * The revertible object representing the commit that can be undone or redone.
	 */
	readonly revertible: RevertibleAlpha;
	/**
	 * Labels associated with the commit (if any).
	 */
	readonly labels: ReadonlySet<unknown>;
}

/**
 * Returns a predicate that matches any stack entry whose label set contains `label`.
 * When `label` is `undefined`, the predicate matches every entry (global operation).
 *
 * @param label - The value to match against, or `undefined` for a global match-all predicate.
 */
function labelPredicate(label: unknown): (entry: StackEntry) => boolean {
	return label === undefined ? () => true : (entry) => entry.labels.has(label);
}

/**
 * Concrete implementation of {@link UndoRedo} for a SharedTree branch.
 *
 * @remarks
 * A single instance must be created per tree branch. Passing a branch that already has an
 * attached manager throws immediately at construction time.
 *
 * @sealed @internal
 */
const attachedBranches = new WeakSet<TreeBranchAlpha>();

/**
 * {@link UndoRedo} implementation.
 */
class UndoRedoManager implements UndoRedo {
	/** Commits available to undo, ordered oldest-first. */
	readonly #undoStack: StackEntry[] = [];

	/** Commits available to redo, ordered oldest-first. */
	readonly #redoStack: StackEntry[] = [];

	/** Unsubscribes this manager from the branch's `changed` event. */
	readonly #unsubscribe: () => void;

	/**
	 * The branch this manager is attached to.
	 * @remarks Retained after construction so it can be removed from {@link attachedBranches} on dispose.
	 */
	readonly #branch: TreeBranchAlpha;

	/**
	 * Set synchronously around `revert()` calls so the `changed` event handler can attribute the
	 * resulting commit to an undo or redo action rather than treating it as a new user commit.
	 *
	 * @remarks
	 * This workaround is needed because SharedTree's `revert()` does not preserve the original
	 * commit's labels on the resulting commit.
	 * TODO: AB#71256: Remove once SharedTree supports preserving commit labels on revert.
	 */
	#pendingOperation: { kind: "undo" | "redo"; labels: ReadonlySet<unknown> } | undefined;

	/** Whether or not this instance has been disposed. */
	#disposed = false;

	/**
	 * @param branch - The tree branch whose commits this manager will track.
	 * @throws If a manager is already attached to `branch`.
	 */
	public constructor(branch: TreeBranchAlpha) {
		if (attachedBranches.has(branch)) {
			throw new UsageError("An UndoRedoManager is already attached to this branch.");
		}
		attachedBranches.add(branch);
		this.#branch = branch;
		this.#unsubscribe = branch.events.on("changed", (data, getRevertible) => {
			if (!data.isLocal || getRevertible === undefined) {
				return;
			}

			if (this.#pendingOperation !== undefined) {
				const { kind, labels } = this.#pendingOperation;
				const revertible = getRevertible();
				// Route to the opposite stack, preserving the original commit's labels so that
				// label-filtered canUndo/canRedo/undo/redo remain consistent after undo or redo.
				if (kind === "undo") {
					this.#redoStack.push({ revertible, labels });
				} else {
					this.#undoStack.push({ revertible, labels });
				}
				// Don't notify here; undo()/redo() will notify once after revert() returns.
				return;
			}

			// Normal user commit: extract root-level symbol labels from the commit metadata.
			// Nested label nodes (produced by inner runTransaction calls) are not traversed —
			// see UndoRedo remarks.
			const commitLabels = new Set<unknown>();
			for (const label of data.labels) {
				if (typeof label === "symbol") {
					commitLabels.add(label);
				}
			}

			// Redo invalidation: clear redo entries whose label sets overlap with this commit's labels.
			for (let i = this.#redoStack.length - 1; i >= 0; i--) {
				const entry = this.#redoStack[i];
				if (entry === undefined) {
					throw new Error("Unexpected undefined entry in redo stack");
				}

				const disjoint =
					commitLabels.size === 0
						? entry.labels.size > 0
						: areSetsDisjoint(commitLabels, entry.labels);
				if (!disjoint) {
					entry.revertible.dispose();
					this.#redoStack.splice(i, 1);
				}
			}

			this.#undoStack.push({ revertible: getRevertible(), labels: commitLabels });
		});
	}

	public undo(label?: unknown): void {
		if (this.#disposed) {
			return;
		}
		this.#revertWhere(this.#undoStack, "undo", labelPredicate(label));
	}

	public redo(label?: unknown): void {
		if (this.#disposed) {
			return;
		}
		this.#revertWhere(this.#redoStack, "redo", labelPredicate(label));
	}

	public canUndo(label?: unknown): boolean {
		return this.#undoStack.some(labelPredicate(label));
	}

	public canRedo(label?: unknown): boolean {
		return this.#redoStack.some(labelPredicate(label));
	}

	public dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#unsubscribe();
		attachedBranches.delete(this.#branch);
		for (const e of this.#undoStack) {
			e.revertible.dispose();
		}
		for (const e of this.#redoStack) {
			e.revertible.dispose();
		}
		this.#undoStack.length = 0;
		this.#redoStack.length = 0;
	}

	/**
	 * Walks `stack` from the top and returns the index of the first entry matching `predicate`,
	 * or `undefined` if none match.
	 *
	 * @param stack - The undo or redo stack to search.
	 * @param predicate - Called for each entry from the top; the first entry for which it returns
	 * `true` is selected.
	 */
	static #findLast(
		stack: StackEntry[],
		predicate: (entry: StackEntry) => boolean,
	): number | undefined {
		for (let i = stack.length - 1; i >= 0; i--) {
			const entry = stack[i] ?? oob();
			if (predicate(entry)) {
				return i;
			}
		}
		return undefined;
	}

	/**
	 * Reverts the top-most entry in `stack` matching `predicate`.
	 * @remarks No-ops if no entry matches.
	 *
	 * @param stack - The undo or redo stack to operate on.
	 * @param kind - Whether this is an `"undo"` or `"redo"` operation, used to route the resulting
	 * revertible to the opposite stack.
	 * @param predicate - Selects the target entry; the top-most matching entry is reverted.
	 */
	#revertWhere(
		stack: StackEntry[],
		kind: "undo" | "redo",
		predicate: (entry: StackEntry) => boolean,
	): void {
		const index = UndoRedoManager.#findLast(stack, predicate);
		if (index === undefined) {
			return;
		}
		const entry = stack[index] ?? oob();
		this.#pendingOperation = { kind, labels: entry.labels };
		try {
			// revert(false) reverts without auto-disposing, so the entry remains retryable if it throws.
			entry.revertible.revert(false);
		} finally {
			this.#pendingOperation = undefined;
		}
		// Only remove and dispose after a successful revert.
		// If revert() throws, the entry stays so the user can retry.
		stack.splice(index, 1);
		entry.revertible.dispose();
	}
}

/**
 * Creates a {@link UndoRedo} manager that tracks commits on the given tree branch.
 *
 * @remarks
 * A single instance must be created per tree branch. Passing a branch that already has an
 * attached manager throws immediately.
 *
 * @param branch - The tree branch whose commits this manager will track.
 * @returns A {@link UndoRedo} instance scoped to the given branch.
 * @throws If a manager is already attached to `branch`.
 * @internal
 */
export function createUndoRedo(branch: TreeBranchAlpha): UndoRedo {
	return new UndoRedoManager(branch);
}
