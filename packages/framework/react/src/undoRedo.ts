/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { RevertibleAlpha, TreeBranchAlpha } from "@fluidframework/tree/internal";

/**
 * An undo/redo manager that supports optional scoping based on transaction labels.
 *
 * @remarks
 * When a label is provided to `undo` / `redo`, the operation targets the most recent commit
 * whose label set contains that symbol, skipping commits with non-matching labels. When no
 * label is provided the operation is global and targets the most recent commit regardless of
 * labels.
 *
 * **Redo invalidation:** when a new user commit arrives, redo entries whose label sets overlap
 * with the new commit's labels are discarded. An anonymous commit (no labels) discards only
 * anonymous redo entries; labeled redo entries are preserved. Similarly, calling `undo(label)`
 * discards redo entries that overlap with the undone commit's labels.
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
 * ```ts
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
 * ```ts
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
	 * Undoes the most recent commit whose labels include `label`.
	 *
	 * @param label - The label to match against. If omitted, undoes the most recent commit
	 * regardless of labels.
	 * This method no-ops if there is nothing to undo matching the label policy.
	 *
	 * @see {@link UndoRedo.canUndo}
	 */
	undo(label?: symbol): void;

	/**
	 * Redoes the most recent undone commit whose labels include `label`.
	 *
	 * @param label - The label to match against. If omitted, redoes the most recent undone commit
	 * regardless of labels.
	 * This method no-ops if there is nothing to redo matching the label policy.
	 *
	 * @see {@link UndoRedo.canRedo}
	 */
	redo(label?: symbol): void;

	/**
	 * Returns true if there is at least one commit available to undo matching the label policy.
	 *
	 * @param label - The label to check for. If omitted, checks the global undo stack.
	 *
	 * @see {@link UndoRedo.undo}
	 */
	canUndo(label?: symbol): boolean;

	/**
	 * Returns true if there is at least one commit available to redo matching the label policy.
	 *
	 * @param label - The label to check for. If omitted, checks the global redo stack.
	 *
	 * @see {@link UndoRedo.redo}
	 */
	canRedo(label?: symbol): boolean;

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

interface StackEntry {
	/**
	 * The revertible object representing the commit that can be undone or redone.
	 */
	revertible: RevertibleAlpha;
	/**
	 * Labels associated with the commit (if any).
	 */
	labels: ReadonlySet<symbol>;
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

class UndoRedoManager implements UndoRedo {
	readonly #undoStack: StackEntry[] = [];
	readonly #redoStack: StackEntry[] = [];
	readonly #unsubscribe: () => void;
	readonly #branch: TreeBranchAlpha;
	// Set synchronously around revert() calls so the changed event handler can attribute the
	// resulting commit to this manager's undo or redo action rather than treating it as a new
	// user commit. Cleared before notifying listeners.
	#pendingOperation: { kind: "undo" | "redo"; labels: ReadonlySet<symbol> } | undefined;
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
			if (!data.isLocal || getRevertible === undefined) return;

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

			// Normal user commit: extract symbol labels from the commit metadata.
			// Only root-level symbol entries are collected; nested label nodes (produced by
			// inner runTransaction calls) are not traversed — see UndoRedo remarks.
			const symbolLabels = new Set<symbol>();
			for (const labels of data.labels) {
				if (typeof labels === "symbol") {
					symbolLabels.add(labels);
				}
			}

			// Redo invalidation: clear redo entries whose label sets overlap with this commit's labels.
			for (let i = this.#redoStack.length - 1; i >= 0; i--) {
				const entry = this.#redoStack[i];
				if (entry === undefined) {
					throw new Error("Unexpected undefined entry in redo stack");
				}

				const overlaps =
					symbolLabels.size === 0
						? entry.labels.size === 0
						: [...symbolLabels].some((l) => entry.labels.has(l));
				if (overlaps) {
					entry.revertible.dispose();
					this.#redoStack.splice(i, 1);
				}
			}

			this.#undoStack.push({ revertible: getRevertible(), labels: symbolLabels });
		});
	}

	public undo(label?: symbol): void {
		if (this.#disposed){
			return;
		}
		const index =
			label === undefined
				? this.#undoStack.length > 0
					? this.#undoStack.length - 1
					: undefined
				: this.#lastIndexWithLabel(this.#undoStack, label);
		if (index === undefined) {
			return;
		}
		const entry = this.#undoStack[index] ?? oob();
		this.#pendingOperation = { kind: "undo", labels: entry.labels };
		try {
			entry.revertible.revert();
		} finally {
			this.#pendingOperation = undefined;
		}
		// Only remove from the stack after a successful revert.
		// If revert() throws, the entry stays so the user can retry.
		this.#undoStack.splice(index, 1);
	}

	public redo(label?: symbol): void {
		if (this.#disposed) {
			return;
		}
		const index =
			label === undefined
				? this.#redoStack.length > 0
					? this.#redoStack.length - 1
					: undefined
				: this.#lastIndexWithLabel(this.#redoStack, label);
		if (index === undefined) {
			return;
		}
		const entry = this.#redoStack[index] ?? oob();
		this.#pendingOperation = { kind: "redo", labels: entry.labels };
		try {
			entry.revertible.revert();
		} finally {
			this.#pendingOperation = undefined;
		}
		// Only remove from the stack after a successful revert.
		// If revert() throws, the entry stays so the user can retry.
		this.#redoStack.splice(index, 1);
	}

	public canUndo(label?: symbol): boolean {
		if (label === undefined) {
			return this.#undoStack.length > 0;
		}
		return this.#undoStack.some((e) => e.labels.has(label));
	}

	public canRedo(label?: symbol): boolean {
		if (label === undefined) {
			return this.#redoStack.length > 0;
		}
		return this.#redoStack.some((e) => e.labels.has(label));
	}

	public dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#unsubscribe();
		attachedBranches.delete(this.#branch);
		for (const e of this.#undoStack) e.revertible.dispose();
		for (const e of this.#redoStack) e.revertible.dispose();
		this.#undoStack.length = 0;
		this.#redoStack.length = 0;
	}

	#lastIndexWithLabel(stack: StackEntry[], label: symbol): number | undefined {
		assert(!this.#disposed, "Undo/redo manager is disposed.");
		for (let i = stack.length - 1; i >= 0; i--) {
			const entry = stack[i];
			if (entry === undefined) {
				throw new Error("Unexpected undefined entry in stack");
			}
			if (entry.labels.has(label)) {
				return i;
			}
		}
		return undefined;
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
