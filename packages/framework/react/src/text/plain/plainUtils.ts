/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type TextAsTree, utf16LengthForCodePoints } from "@fluidframework/tree/internal";

import { clamp } from "../../utilities.js";

/**
 * A text selection or cursor range expressed as UTF-16 code-unit offsets.
 * @remarks
 * These match the `selectionStart` / `selectionEnd` properties of an HTML `<input>` / `<textarea>`,
 * and the offsets used to index into a JavaScript string. A collapsed cursor has `start === end`.
 * @internal
 */
export interface TextSelection {
	/** UTF-16 offset of the start of the selection. */
	readonly start: number;
	/** UTF-16 offset of the end of the selection. */
	readonly end: number;
}

/**
 * The result of applying a character-level delta to an existing text value via {@link applyTextOps}.
 * @internal
 */
export interface ApplyTextOpsResult {
	/** The updated text value after applying the ops. */
	readonly value: string;
	/**
	 * The input selection, adjusted to follow the same logical position across the edit.
	 * @remarks
	 * Always a valid range within {@link ApplyTextOpsResult.value} (each offset is clamped to
	 * `[0, value.length]`), so it can be written straight back to an element without further bounds checks.
	 */
	readonly selection: TextSelection;
}

/**
 * Apply a character-level delta to an existing text value, producing the new value and a
 * selection range adjusted to track the same logical position across the edit.
 * @remarks
 * `ops` are the deltas delivered by {@link @fluidframework/tree#TextAsTree.Members.onCharactersChanged}.
 * Applying them incrementally avoids a full O(N) re-read of the text on every change.
 *
 * This function is intentionally DOM-free so consumers maintaining their own UI (a custom React
 * component, a non-`textarea` element, or a non-React renderer) can reuse it: read the current value
 * and selection from your view, call this, then write the result back.
 *
 * `onCharactersChanged` delivers `undefined` (rather than an op list) when an incremental delta is
 * unavailable; in that case skip this function and re-read the whole text via `root.fullString()`.
 *
 * Writing the result back must not re-enter the tree — see {@link syncTextToTree} for the re-entrancy pattern.
 * @internal
 */
export function applyTextOps(
	oldValue: string,
	selection: TextSelection,
	ops: readonly TextAsTree.TextOp[],
): ApplyTextOpsResult {
	const { start: selectionStart, end: selectionEnd } = selection;

	// readPos is a UTF-16 code-unit index into oldValue.
	let readPos = 0;
	let value = "";
	let newCursorStart = selectionStart;
	let newCursorEnd = selectionEnd;

	for (const op of ops) {
		if (op.type === "retain") {
			// Convert the code-point count to UTF-16 units by scanning the actual characters.
			const utf16Count = utf16LengthForCodePoints(oldValue, readPos, op.count);
			value += oldValue.slice(readPos, readPos + utf16Count);
			readPos += utf16Count;
		} else if (op.type === "insert") {
			// op.text is a JS string; use its UTF-16 length for cursor adjustment.
			if (readPos <= selectionStart) {
				newCursorStart += op.text.length;
			}
			if (readPos <= selectionEnd) {
				newCursorEnd += op.text.length;
			}
			value += op.text;
		} else {
			// remove
			// Convert the code-point count to UTF-16 units before adjusting cursors.
			const utf16Count = utf16LengthForCodePoints(oldValue, readPos, op.count);
			const removeEnd = readPos + utf16Count;
			if (removeEnd <= selectionStart) {
				newCursorStart -= utf16Count;
			} else if (readPos < selectionStart) {
				newCursorStart -= selectionStart - readPos;
			}
			if (removeEnd <= selectionEnd) {
				newCursorEnd -= utf16Count;
			} else if (readPos < selectionEnd) {
				newCursorEnd -= selectionEnd - readPos;
			}
			readPos += utf16Count;
		}
	}

	// Append any tail not covered by ops (e.g. trailing retained content).
	value += oldValue.slice(readPos);

	// Clamp to a valid range within `value` so the result can be written back without further checks.
	// A stale input selection (e.g. beyond `oldValue`) can otherwise land outside the new value.
	return {
		value,
		selection: {
			start: clamp(newCursorStart, 0, value.length),
			end: clamp(newCursorEnd, 0, value.length),
		},
	};
}

/**
 * Collapse a tracked selection to a single caret, for use when a text change arrives without an
 * incremental delta and the whole string must be re-read.
 * @remarks
 * When no delta is available (see {@link @fluidframework/tree#TextAsTree.Members.onCharactersChanged}),
 * there is no reliable way to map a selection *range* across the edit: preserving `start`/`end`
 * independently can leave a range spanning characters unrelated to the original selection (e.g. when a
 * batch deletes the selected text and inserts new text of similar length). To avoid presenting a
 * misleading highlight, the range is collapsed to a caret at the (clamped) previous `start` offset,
 * which keeps the caret near its prior position in the common benign case while never selecting
 * unrelated characters.
 *
 * Returns `undefined` when `selection` is `undefined`, so an untracked selection stays untracked.
 * @param selection - The selection to collapse, or `undefined` if none is tracked.
 * @param length - The length of the re-read text; the caret is clamped to `[0, length]`.
 * @internal
 */
export function collapseSelectionOnReread(
	selection: TextSelection | undefined,
	length: number,
): TextSelection | undefined {
	if (selection === undefined) {
		return undefined;
	}
	const caret = clamp(selection.start, 0, length);
	return { start: caret, end: caret };
}

/**
 * Sync `newText` into the provided `root` tree by applying the minimal remove + insert pair
 * needed to transform the tree's current content into `newText`.
 * @remarks
 * The diff is computed by finding the longest shared prefix/suffix between current and new content
 * and replacing only the middle span.
 *
 * To make the edit atomically undoable/redoable, wrap this call in a transaction, e.g.
 * `TreeAlpha.context(root).runTransaction(() => syncTextToTree(root, newText), { label })`. The
 * `label` correlates the edit for undo/redo grouping where the context supports it (see
 * {@link @fluidframework/tree#TreeContextAlpha.runTransaction}).
 *
 * Mutating the tree synchronously fires
 * {@link @fluidframework/tree#TextAsTree.Members.onCharactersChanged}. If you also subscribe to that
 * event to apply remote edits to your view (e.g. via {@link applyTextOps}), set a re-entrancy flag
 * before calling this and ignore the event while it is set — otherwise the edit you just made is
 * echoed straight back onto your view. For example:
 *
 * ```typescript
 * let updating = false;
 * root.onCharactersChanged((ops) => {
 *   if (updating) return; // ignore the echo of our own local edit
 *   // ...apply ops to your view via applyTextOps...
 * });
 *
 * function onUserInput(newText: string): void {
 *   updating = true;
 *   try {
 *     syncTextToTree(root, newText);
 *   } finally {
 *     updating = false;
 *   }
 * }
 * ```
 * @internal
 */
export function syncTextToTree(root: TextAsTree.Tree, newText: string): void {
	const sync = computeSync(root.charactersCopy(), [...newText]);

	if (sync.remove) {
		root.removeRange(sync.remove.start, sync.remove.end);
	}
	if (sync.insert) {
		root.insertAt(sync.insert.location, sync.insert.slice.join(""));
	}
}

/**
 * Compute a single remove + insert pair that transforms `existing` into `final`
 * by finding the longest shared prefix/suffix and replacing the entire middle span.
 * @remarks
 * This is intentionally **not** a general diff. It does not try to preserve interior
 * unchanged ranges — for example, going from `"aXbYc"` to `"aZbWc"` produces one remove
 * of `"XbY"` and one insert of `"ZbW"`, even though `"b"` is unchanged in the middle.
 * This is sufficient for the typing/paste workloads this helper targets (where edits
 * are typically contiguous), and avoids the cost of running a full diff algorithm on
 * every keystroke.
 *
 * Exported for unit testing.
 * @internal
 */
export function computeSync<T>(
	existing: readonly T[],
	final: readonly T[],
): { remove?: { start: number; end: number }; insert?: { location: number; slice: T[] } } {
	// Find common prefix and suffix to minimize changes

	let prefixLength = 0;
	while (
		prefixLength < existing.length &&
		prefixLength < final.length &&
		existing[prefixLength] === final[prefixLength]
	) {
		prefixLength++;
	}

	let suffixLength = 0;
	while (
		suffixLength + prefixLength < existing.length &&
		suffixLength + prefixLength < final.length &&
		existing[existing.length - 1 - suffixLength] === final[final.length - 1 - suffixLength]
	) {
		suffixLength++;
	}

	// Locate middle replaced range in existing and final
	const existingMiddleStart = prefixLength;
	const existingMiddleEnd = existing.length - suffixLength;
	const newMiddleStart = prefixLength;
	const newMiddleEnd = final.length - suffixLength;

	return {
		remove:
			existingMiddleStart < existingMiddleEnd
				? { start: existingMiddleStart, end: existingMiddleEnd }
				: undefined,
		insert:
			newMiddleStart < newMiddleEnd
				? {
						location: existingMiddleStart,
						slice: final.slice(newMiddleStart, newMiddleEnd),
					}
				: undefined,
	};
}
