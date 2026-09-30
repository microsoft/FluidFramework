/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ArrayPlaceAnchor,
	codePointCount,
	type PlainText,
	utf16LengthForCodePoints,
} from "@fluidframework/tree/internal";
import { clamp } from "@fluidframework/core-utils/internal";
import { useCallback, useEffect, useRef, useState } from "react";

import { applyTextOps, remapSelectionOnReread, type TextSelection } from "./plainUtils.js";

interface SelectionAnchors {
	readonly start: ArrayPlaceAnchor;
	readonly end: ArrayPlaceAnchor;
}

/**
 * The value returned by {@link useTreeSynchronizedString}.
 * @sealed
 * @alpha
 */
export interface SynchronizedString {
	/** The tree's current text. */
	readonly text: string;
	/**
	 * A selection range tracked across edits, or `undefined` when no selection is being tracked.
	 * @remarks
	 * Seeded from the `initialSelection` passed to {@link useTreeSynchronizedString}, updated by
	 * {@link SynchronizedString.setSelection}, and adjusted as the tree's characters change so it
	 * follows the same logical position across edits.
	 *
	 * Tracking is best-effort: in rare cases the selection may be dropped (become `undefined`) when it
	 * cannot be mapped reliably across a change.
	 *
	 * This is not a live caret: the hook does not observe the user's actual cursor, so a consumer that
	 * needs the real caret position must read it from the rendered element and pass it to
	 * {@link SynchronizedString.setSelection}.
	 */
	readonly selection: TextSelection | undefined;
	/**
	 * Update the selection range tracked across subsequent tree edits.
	 * @param selection - The new selection, or `undefined` to stop tracking one.
	 */
	readonly setSelection: (selection: TextSelection | undefined) => void;
}

/**
 * React hook that provides a one-way sync from a {@link @fluidframework/tree#PlainText.Tree} to a
 * string: it returns the tree's current text (and a tracked selection), recomputed whenever the
 * tree's characters change.
 * @remarks
 * This makes no assumption about how the string is rendered (`<input>`, `<textarea>`, contenteditable,
 * canvas, …) and intentionally does **not** handle writing back to the tree.
 *
 * The consumer supplies the other direction (string → tree) themselves. Different text APIs report
 * their edits in different formats, so there is no one-size-fits-all mapping; prefer translating the
 * API's own change delta into an incremental tree edit whenever it exposes one. For simple APIs like
 * `<textarea>`, whose change events only surface the fully-updated string, {@link syncTextToTree}
 * provides a naive diff-and-apply that is sufficient (wrap it in a transaction to make the edit
 * atomically undoable):
 *
 * ```tsx
 * const { text, setSelection } = useTreeSynchronizedString(tree);
 * return (
 *   <textarea
 *     value={text}
 *     onSelect={(e) =>
 *       setSelection({
 *         start: e.currentTarget.selectionStart ?? 0,
 *         end: e.currentTarget.selectionEnd ?? 0,
 *       })
 *     }
 *     onChange={(e) => {
 *       TreeAlpha.context(tree).runTransaction(() => syncTextToTree(tree, e.target.value));
 *       setSelection({
 *         start: e.target.selectionStart ?? 0,
 *         end: e.target.selectionEnd ?? 0,
 *       });
 *     }}
 *   />
 * );
 * ```
 * @param tree - The plain-text tree whose content should be synchronized.
 * @param initialSelection - The initial selection to track, expressed as UTF-16 string offsets.
 * @alpha
 */
export function useTreeSynchronizedString(
	tree: PlainText.Tree,
	initialSelection?: TextSelection,
): SynchronizedString {
	const [text, setText] = useState(() => tree.fullString());
	const [, setSelectionVersion] = useState(0);

	const textRef = useRef(text);
	const selectionRef = useRef<TextSelection | undefined>(initialSelection);
	const anchorsRef = useRef<SelectionAnchors | undefined>(undefined);

	const disposeSelectionAnchors = useCallback(() => {
		// Replacing or clearing a selection transfers ownership away from its previous anchors.
		anchorsRef.current?.start.dispose();
		anchorsRef.current?.end.dispose();
		anchorsRef.current = undefined;
	}, []);

	const setSelection = useCallback(
		(trackedSelection: TextSelection | undefined) => {
			disposeSelectionAnchors();
			selectionRef.current = trackedSelection;
			if (trackedSelection !== undefined) {
				const value = textRef.current;
				const start = clamp(trackedSelection.start, 0, value.length);
				const end = clamp(trackedSelection.end, 0, value.length);
				anchorsRef.current = {
					start: tree.createInsertionAnchor(codePointCount(value.slice(0, start))),
					end: tree.createInsertionAnchor(codePointCount(value.slice(0, end))),
				};
			}
			// Anchor updates do not affect React state, so explicitly publish the new selection.
			setSelectionVersion((version) => version + 1);
		},
		[disposeSelectionAnchors, tree],
	);

	useEffect(() => {
		const full = tree.fullString();
		textRef.current = full;
		setText(full);
		// Recreate the anchors against the newly bound tree while preserving the tracked offsets.
		if (selectionRef.current !== undefined) {
			setSelection(selectionRef.current);
		}

		const off = tree.onCharactersChanged((ops) => {
			if (ops === undefined) {
				// No incremental delta is available for this change, so re-read the whole string.
				// This happens when the character field's marks couldn't be composed into a single
				// delta — e.g. the field was modified across multiple batches within one flush (such
				// as an interleaved schema change) — or when the tree is out of sync with the delta.
				const previous = textRef.current;
				const reread = tree.fullString();
				textRef.current = reread;
				setText(reread);
				// Without a delta we can't know exactly how the text mutated, so we can't faithfully
				// move a selection range across the edit. Make a best effort by inferring a single
				// contiguous edit from the old/new text (see remapSelectionOnReread); if an endpoint
				// lands in the ambiguous replaced span, the selection is dropped rather than placed at
				// an arbitrary position. A consumer that needs an accurate caret should read it from
				// the rendered element.
				setSelection(remapSelectionOnReread(selectionRef.current, previous, reread));
				return;
			}

			const value = applyTextOps(textRef.current, ops);
			textRef.current = value;
			setText(value);
		});

		return () => {
			off();
			disposeSelectionAnchors();
		};
	}, [disposeSelectionAnchors, setSelection, tree]);

	// Resolve the live code-point anchor indices back to the UTF-16 offsets used by DOM selections.
	const anchors = anchorsRef.current;
	const selection =
		anchors === undefined
			? selectionRef.current
			: {
					start: utf16LengthForCodePoints(text, 0, anchors.start.index),
					end: utf16LengthForCodePoints(text, 0, anchors.end.index),
				};
	selectionRef.current = selection;

	return { text, selection, setSelection };
}
