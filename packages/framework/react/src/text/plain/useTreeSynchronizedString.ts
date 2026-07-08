/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextAsTree } from "@fluidframework/tree/internal";
import { useEffect, useRef, useState } from "react";

import { applyTextOps, collapseSelectionOnReread, type TextSelection } from "./plainUtils.js";

/**
 * The value returned by {@link useTreeSynchronizedString}.
 * @internal
 */
export interface SynchronizedString {
	/** The tree's current text. */
	readonly text: string;
	/**
	 * A selection range tracked across edits, or `undefined` when no selection is being tracked.
	 * @remarks
	 * Seeded from the `initialSelection` passed to {@link useTreeSynchronizedString} and adjusted by
	 * {@link applyTextOps} so it follows the same logical position as the text changes.
	 *
	 * When an incremental delta is unavailable and the hook must re-read the whole string, the range
	 * cannot be faithfully mapped across the edit, so it is collapsed to a single caret at the
	 * (clamped) previous start offset.
	 *
	 * This is not a live caret: the hook does not observe the user's actual cursor, so a consumer that
	 * needs the real caret position must read it from the rendered element itself.
	 */
	readonly selection: TextSelection | undefined;
}

/**
 * React hook that provides a one-way sync from a {@link @fluidframework/tree#TextAsTree.Tree} to a
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
 * const { text } = useTreeSynchronizedString(tree);
 * return (
 *   <textarea
 *     value={text}
 *     onChange={(e) =>
 *       TreeAlpha.context(tree).runTransaction(() => syncTextToTree(tree, e.target.value))
 *     }
 *   />
 * );
 * ```
 * @internal
 */
export function useTreeSynchronizedString(
	tree: TextAsTree.Tree,
	initialSelection?: TextSelection,
): SynchronizedString {
	const [text, setText] = useState<string>(() => tree.fullString());
	const [selection, setSelection] = useState<TextSelection | undefined>(initialSelection);

	// Mirror the latest text/selection in refs so the change listener reads current values without
	// having to re-subscribe (which would re-run the effect) on every update.
	const textRef = useRef(text);
	textRef.current = text;
	const selectionRef = useRef(selection);
	selectionRef.current = selection;

	useEffect(() => {
		const full = tree.fullString();
		textRef.current = full;
		setText(full);

		return tree.onCharactersChanged((ops) => {
			if (ops === undefined) {
				// No incremental delta is available for this change, so re-read the whole string.
				// This happens when the character field's marks couldn't be composed into a single
				// delta — e.g. the field was modified across multiple batches within one flush (such
				// as an interleaved schema change) — or when the tree is out of sync with the delta.
				const reread = tree.fullString();
				textRef.current = reread;
				setText(reread);
				// Without a delta we can't know how the text mutated, so we can't faithfully move a
				// selection range across the edit. Collapse it to a caret rather than leave a range
				// spanning what may now be unrelated characters — see collapseSelectionOnReread. A
				// consumer that needs an accurate caret should read it from the rendered element.
				if (selectionRef.current !== undefined) {
					const collapsed = collapseSelectionOnReread(selectionRef.current, reread.length);
					selectionRef.current = collapsed;
					setSelection(collapsed);
				}
				return;
			}

			// Only track a selection if the consumer supplied one; otherwise leave it undefined and
			// discard the range returned by applyTextOps.
			const oldSelection = selectionRef.current;
			const result = applyTextOps(textRef.current, oldSelection ?? { start: 0, end: 0 }, ops);
			textRef.current = result.value;
			setText(result.value);
			if (oldSelection !== undefined) {
				selectionRef.current = result.selection;
				setSelection(result.selection);
			}
		});
	}, [tree]);

	return { text, selection };
}
