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
	 * A selection range tracked across edits.
	 * @remarks
	 * Seeded from `initialSelection` and adjusted by {@link applyTextOps} as the text changes. It
	 * follows the same logical position across edits, but the hook does not observe the user's live
	 * caret, so a consumer that needs an accurate caret should track the element's selection itself.
	 */
	readonly selection: TextSelection | undefined;
}

/**
 * React hook that provides a one-way sync from a {@link @fluidframework/tree#TextAsTree.Tree} to a
 * string: it returns the tree's current text (and a tracked selection), recomputed whenever the
 * tree's characters change.
 * @remarks
 * This is the small, broadly-applicable primitive for reading a text tree in React. It owns only the
 * subscription and the incremental {@link applyTextOps} apply (with a full re-read fallback). It
 * makes no assumption about how the string is rendered (`<input>`, `<textarea>`, contenteditable,
 * canvas, …) and intentionally does **not** handle writing back to the tree.
 *
 * The consumer supplies the other direction (string → tree) themselves, typically by calling
 * {@link applyTextEdit} from their input's change handler:
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
		// Re-seed when the bound node changes.
		const full = tree.fullString();
		textRef.current = full;
		setText(full);

		return tree.onCharactersChanged((ops) => {
			if (ops === undefined) {
				// No incremental delta available — re-read the whole string (selection unchanged).
				const reread = tree.fullString();
				textRef.current = reread;
				setText(reread);
				return;
			}

			const oldText = textRef.current;
			const oldSelection = selectionRef.current ?? {
				start: oldText.length,
				end: oldText.length,
			};
			const result = applyTextOps(oldText, oldSelection, ops);
			textRef.current = result.value;
			selectionRef.current = result.selection;
			setText(result.value);
			setSelection(result.selection);
		});
	}, [tree]);

	return { text, selection };
}
