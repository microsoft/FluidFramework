/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RevertibleAlpha, TreeBranchAlpha } from "@fluidframework/tree/internal";

/**
 * Interface for undo/redo stack operations.
 * @internal
 */
export interface UndoRedo {
	/** Reverts the most recent change. */
	undo(): void;
	/** Reapplies the most recently undone change. */
	redo(): void;
	dispose(): void;
	canUndo(): boolean;
	canRedo(): boolean;
}

/**
 * Extends {@link UndoRedo} with optional label parameters for per-label undo/redo operations.
 *
 * @remarks
 * When a label is provided to `undo` / `redo`, the operation targets the most recent commit
 * whose label set contains that symbol, skipping commits with non-matching labels. When no
 * label is provided the operation is global and targets the most recent commit regardless of
 * labels.
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
 * const manager = new UndoRedoManager(treeView);
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
export interface LabeledUndoRedo extends UndoRedo {
	/**
	 * Undoes the most recent commit whose labels include `label`.
	 *
	 * @param label - The label to match against. If omitted, undoes the most recent commit
	 * regardless of labels.
	 * This method no-ops if there is nothing to undo matching the label policy.
	 *
	 * @see {@link LabeledUndoRedo.canUndo}
	 */
	undo(label?: symbol): void;

	/**
	 * Redoes the most recent undone commit whose labels include `label`.
	 *
	 * @param label - The label to match against. If omitted, redoes the most recent undone commit
	 * regardless of labels.
	 * This method no-ops if there is nothing to redo matching the label policy.
	 *
	 * @see {@link LabeledUndoRedo.canRedo}
	 */
	redo(label?: symbol): void;

	/**
	 * Returns true if there is at least one commit available to undo matching the label policy.
	 *
	 * @param label - The label to check for. If omitted, checks the global undo stack.
	 *
	 * @see {@link LabeledUndoRedo.undo}
	 */
	canUndo(label?: symbol): boolean;

	/**
	 * Returns true if there is at least one commit available to redo matching the label policy.
	 *
	 * @param label - The label to check for. If omitted, checks the global redo stack.
	 *
	 * @see {@link LabeledUndoRedo.redo}
	 */
	canRedo(label?: symbol): boolean;
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
 * A single undo/redo manager for a tree branch that supports both global and per-label operations.
 *
 * @remarks
 * A single instance should be created per tree branch. It subscribes to the branch's `changed`
 * event exactly once, so multiple instances on the same branch will each try to call
 * `getRevertible()`, which is not permitted.
 *
 * **Redo invalidation:** when a new user commit arrives with labels `{A, B}`, all redo entries
 * whose label sets intersect `{A, B}` are cleared. An anonymous commit (no labels) clears only
 * anonymous redo entries. Entries with no label overlap are preserved.
 *
 * **Nested-transaction labels:** only root-level symbol labels are extracted from each commit.
 * Labels from inner nested transactions are ignored. See {@link LabeledUndoRedo} for details.
 *
 * @example Typical React setup — one manager per user, shared via context
 * ```tsx
 * function UserPanel({ treeView }: { treeView: TreeViewAlpha<typeof MySchema> }) {
 *     const manager = useMemo(() => new UndoRedoManager(treeView), [treeView]);
 *     useEffect(() => () => manager.dispose(), [manager]);
 *
 *     return (
 *         <UndoRedoContext.Provider value={manager}>
 *             <MyEditor />
 *         </UndoRedoContext.Provider>
 *     );
 * }
 *
 * // In a child editor — use the hook to access the manager and stay reactive:
 * const editorLabel = Symbol("my-editor");
 *
 * function MyEditor() {
 *     const manager = useUndoRedo();
 *     return (
 *         <>
 *             <button
 *                 disabled={manager?.canUndo(editorLabel) !== true}
 *                 onClick={() => manager?.undo(editorLabel)}
 *             >
 *                 Undo
 *             </button>
 *             <button
 *                 disabled={manager?.canRedo(editorLabel) !== true}
 *                 onClick={() => manager?.redo(editorLabel)}
 *             >
 *                 Redo
 *             </button>
 *         </>
 *     );
 * }
 * ```
 *
 * @sealed @internal
 */
export class UndoRedoManager implements LabeledUndoRedo {
	readonly #undoStack: StackEntry[] = [];
	readonly #redoStack: StackEntry[] = [];
	readonly #unsubscribe: () => void;
	// Set synchronously around revert() calls so the changed event handler can attribute the
	// resulting commit to this manager's undo or redo action rather than treating it as a new
	// user commit. Cleared before notifying listeners.
	#pendingOperation: { kind: "undo" | "redo"; labels: ReadonlySet<symbol> } | undefined;

	/**
	 * @param branch - The tree branch whose commits this manager will track.
	 * A single instance per branch is required; multiple instances on the same branch
	 * will each attempt to call `getRevertible()` and the second call will throw.
	 */
	public constructor(branch: TreeBranchAlpha) {
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
			// inner runTransaction calls) are not traversed — see LabeledUndoRedo remarks.
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
		const entry =
			label === undefined
				? this.#undoStack.pop()
				: this.#removeLastWithLabel(this.#undoStack, label);
		// Use if-block rather than early return so TypeScript narrows entry to StackEntry.
		if (entry !== undefined) {
			this.#pendingOperation = { kind: "undo", labels: entry.labels };
			entry.revertible.revert();
			this.#pendingOperation = undefined;
		}
	}

	public redo(label?: symbol): void {
		const entry =
			label === undefined
				? this.#redoStack.pop()
				: this.#removeLastWithLabel(this.#redoStack, label);
		// Use if-block rather than early return so TypeScript narrows entry to StackEntry.
		if (entry !== undefined) {
			this.#pendingOperation = { kind: "redo", labels: entry.labels };
			entry.revertible.revert();
			this.#pendingOperation = undefined;
		}
	}

	public canUndo(label?: symbol): boolean {
		if (label === undefined) return this.#undoStack.length > 0;
		return this.#undoStack.some((e) => e.labels.has(label));
	}

	public canRedo(label?: symbol): boolean {
		if (label === undefined) return this.#redoStack.length > 0;
		return this.#redoStack.some((e) => e.labels.has(label));
	}

	public dispose(): void {
		this.#unsubscribe();
		for (const e of this.#undoStack) e.revertible.dispose();
		for (const e of this.#redoStack) e.revertible.dispose();
		this.#undoStack.length = 0;
		this.#redoStack.length = 0;
	}

	#removeLastWithLabel(stack: StackEntry[], label: symbol): StackEntry | undefined {
		for (let i = stack.length - 1; i >= 0; i--) {
			const entry = stack[i];
			if (entry === undefined) {
				throw new Error("Unexpected undefined entry in undo stack");
			}
			if (entry.labels.has(label)) {
				stack.splice(i, 1);
				return entry;
			}
		}
		return undefined;
	}

}
