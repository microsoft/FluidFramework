/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type TextAsTree,
	TreeAlpha,
	utf16LengthForCodePoints,
} from "@fluidframework/tree/internal";

import { clamp } from "../../utilities.js";

/**
 * A text selection or cursor range expressed as UTF-16 code-unit offsets.
 * @remarks
 * These match the `selectionStart` / `selectionEnd` properties of an HTML `<input>` / `<textarea>`,
 * and the offsets used to index into a JavaScript string. A collapsed cursor has `start === end`.
 * @input
 * @alpha
 */
export interface TextSelection {
	/** UTF-16 offset of the start of the selection. */
	readonly start: number;
	/** UTF-16 offset of the end of the selection. */
	readonly end: number;
}

/**
 * The result of applying a character-level delta to an existing text value via {@link applyTextOps}.
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
 * Find the lengths of the longest common prefix and suffix shared by `a` and `b`.
 * @remarks
 * Works on any indexable sequence, so both the tree diff (arrays of code points — see
 * {@link computeSync}) and the selection remap (strings indexed by UTF-16 code unit — see
 * {@link remapSelectionOnReread}) share one implementation. The prefix and suffix never overlap:
 * their combined length never exceeds either input's length.
 */
function commonAffixLengths<T>(
	a: ArrayLike<T>,
	b: ArrayLike<T>,
): { prefixLength: number; suffixLength: number } {
	let prefixLength = 0;
	while (
		prefixLength < a.length &&
		prefixLength < b.length &&
		a[prefixLength] === b[prefixLength]
	) {
		prefixLength++;
	}
	let suffixLength = 0;
	while (
		suffixLength + prefixLength < a.length &&
		suffixLength + prefixLength < b.length &&
		a[a.length - 1 - suffixLength] === b[b.length - 1 - suffixLength]
	) {
		suffixLength++;
	}
	return { prefixLength, suffixLength };
}

/**
 * Best-effort remap of a tracked selection across a text change that arrived without an incremental
 * delta (so the whole string had to be re-read).
 * @remarks
 * When no delta is available (see {@link @fluidframework/tree#TextAsTree.Members.onCharactersChanged}),
 * the ops that transformed `oldText` into `newText` are unknown, so a selection range cannot be
 * moved faithfully. This makes a best effort by inferring a single contiguous edit the same way
 * {@link computeSync} does — the longest shared prefix/suffix between `oldText` and `newText`, with
 * everything in between treated as one replaced span:
 *
 * - An offset within the shared prefix is unchanged.
 * - An offset within the shared suffix shifts by the change in length.
 * - An offset inside the replaced span has no faithful mapping.
 *
 * If either endpoint falls inside the replaced span, the whole selection is dropped (returns
 * `undefined`) rather than placing an endpoint at an arbitrary position. Like the tree → string
 * diff, this is intentionally not a general diff, so a batch whose real edit was not one contiguous
 * span (e.g. deleting the selected text and inserting similar-length text elsewhere) may drop a
 * selection that a smarter diff could have preserved — which is the safe direction to err.
 *
 * When text is inserted at exactly the offset where the selection begins, that offset is treated as
 * part of the shared prefix, so it stays where it was rather than moving past the inserted text. An
 * empty selection therefore stays just before the inserted text. For a non-empty range,
 * the start stays put while the end shifts, so the range widens to also cover the inserted text.
 *
 * Returns `undefined` when `selection` is `undefined`, so an untracked selection stays untracked.
 * @param selection - The selection to remap, or `undefined` if none is tracked.
 * @param oldText - The text before the change (the value the selection indexes into).
 * @param newText - The re-read text after the change.
 */
export function remapSelectionOnReread(
	selection: TextSelection | undefined,
	oldText: string,
	newText: string,
): TextSelection | undefined {
	if (selection === undefined) {
		return undefined;
	}

	// Longest common prefix/suffix in UTF-16 code units — the unit `TextSelection` offsets use — so
	// remapped offsets line up directly with the offsets a `<textarea>` reports.
	const { prefixLength, suffixLength } = commonAffixLengths(oldText, newText);

	const oldSuffixStart = oldText.length - suffixLength;
	const lengthDelta = newText.length - oldText.length;

	const remapOffset = (offset: number): number | undefined => {
		if (offset <= prefixLength) {
			return offset; // within the shared prefix
		}
		if (offset >= oldSuffixStart) {
			// Within the shared suffix; clamp guards against a stale offset past `oldText`.
			return clamp(offset + lengthDelta, 0, newText.length);
		}
		return undefined; // inside the replaced span — no faithful mapping
	};

	const start = remapOffset(selection.start);
	const end = remapOffset(selection.end);
	if (start === undefined || end === undefined) {
		return undefined;
	}
	return { start, end };
}

/**
 * Sync `newText` into the provided `root` tree by applying the minimal remove + insert pair
 * needed to transform the tree's current content into `newText`.
 * @remarks
 * The diff is computed by finding the longest shared prefix/suffix between current and new content
 * and replacing only the middle span. The resulting remove + insert pair is wrapped in a transaction
 * internally, so a single call applies (and undoes/redoes) as one atomic unit.
 *
 * @example Avoiding re-entrant edits
 *
 * Mutating the tree synchronously fires
 * {@link @fluidframework/tree#TextAsTree.Members.onCharactersChanged}. If you also subscribe to that
 * event to apply remote edits to your view, set a re-entrancy flag
 * before calling this and ignore the event while it is set — otherwise the edit you just made is
 * echoed straight back onto your view:
 *
 * ```typescript
 * let updating = false;
 * root.onCharactersChanged((ops) => {
 *   if (updating) return; // ignore the echo of our own local edit
 *   // ...apply ops to your view...
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
 * @alpha
 */
export function syncTextToTree(root: TextAsTree.Tree, newText: string): void {
	const sync = computeSync(root.charactersCopy(), [...newText]);

	if (sync.remove === undefined && sync.insert === undefined) {
		return;
	}

	// Wrap the remove + insert pair in a transaction so the two edits apply, and undo/redo, as a
	// single atomic unit. Callers can nest this inside their own labeled transaction (see @remarks).
	TreeAlpha.context(root).runTransaction(() => {
		if (sync.remove) {
			root.removeRange(sync.remove.start, sync.remove.end);
		}
		if (sync.insert) {
			root.insertAt(sync.insert.location, sync.insert.slice.join(""));
		}
	});
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
 */
export function computeSync<T>(
	existing: readonly T[],
	final: readonly T[],
): { remove?: { start: number; end: number }; insert?: { location: number; slice: T[] } } {
	// Find common prefix and suffix to minimize changes
	const { prefixLength, suffixLength } = commonAffixLengths(existing, final);

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
