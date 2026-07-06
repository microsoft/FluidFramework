/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextAsTree } from "@fluidframework/tree/internal";
import { useEffect, useRef, useState } from "react";

import { applyTextOps, type TextSelection } from "./plainUtils.js";

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
 * `<textarea>`, whose change events only surface the fully-updated string, {@link applyTextEdit}
 * provides a naive diff-and-apply that is sufficient:
 *
 * ```tsx
 * const { text } = useTreeSynchronizedString(tree);
 * return (
 *   <textarea
 *     value={text}
 *     onChange={(e) => applyTextEdit(tree, e.target.value)}
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
				// A delta could not be computed (e.g. during a schema upgrade, or when the tree is out
				// of sync with the delta), so re-read the whole string. Any tracked selection is clamped
				// into the new text, since a shrinking edit could otherwise leave it out of bounds.
				const reread = tree.fullString();
				textRef.current = reread;
				setText(reread);
				if (selectionRef.current !== undefined) {
					const clamp = (offset: number): number =>
						Math.min(Math.max(offset, 0), reread.length);
					const clamped = {
						start: clamp(selectionRef.current.start),
						end: clamp(selectionRef.current.end),
					};
					selectionRef.current = clamped;
					setSelection(clamped);
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
