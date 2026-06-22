/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextAsTree } from "@fluidframework/tree/internal";
import {
	type ChangeEventHandler,
	type RefCallback,
	useCallback,
	useEffect,
	useReducer,
	useRef,
	useState,
} from "react";

import type { UndoRedo } from "../../undoRedo.js";

import { applyTextEdit, applyTextOps, type TextSelection } from "./plainUtils.js";

/** An element this binding can drive: anything with `value` + selection APIs (`<input>`, `<textarea>`). */
type TextInputElement = HTMLInputElement | HTMLTextAreaElement;

/**
 * Options for {@link usePlainTextInput}.
 * @input @internal
 */
export interface UsePlainTextInputOptions {
	/**
	 * The plain-text tree node to bind to.
	 * @remarks
	 * May be `undefined` while the node is still being created/assigned; the binding attaches once
	 * it becomes defined, and re-attaches if it is later swapped for a different node.
	 */
	readonly text: TextAsTree.Tree | undefined;

	/**
	 * Label used to tag edits made through this binding, so they can be undone/redone independently.
	 * @remarks
	 * Defaults to the {@link UsePlainTextInputOptions.text} node itself. Pass a stable per-editor
	 * value (e.g. an editor id) to scope undo/redo to this editor instance. See {@link applyTextEdit}.
	 */
	readonly editLabel?: unknown;

	/**
	 * The function used to write a user edit back into the tree.
	 * @remarks
	 * Defaults to {@link applyTextEdit} (branch-aware, transaction-wrapped). Override it to supply a
	 * custom transaction/label wrapper.
	 */
	readonly applyEdit?: (root: TextAsTree.Tree, newText: string, label: unknown) => void;

	/**
	 * Optional undo/redo manager.
	 * @remarks
	 * When provided, the hook re-renders the host component on each tree change so undo/redo
	 * availability (e.g. button disabled state) stays current. Omit it to get zero re-renders on
	 * both local and remote edits.
	 */
	readonly undoRedo?: UndoRedo;
}

/**
 * Props produced by {@link usePlainTextInput} to spread onto an uncontrolled text input.
 * @remarks
 * Spread onto a native `<input>` / `<textarea>`:
 *
 * ```tsx
 * const { inputProps } = usePlainTextInput({ text });
 * return <textarea {...inputProps} />;
 * ```
 *
 * For a component-library input that takes a slot ref (e.g. Fluent UI `<Input>`), apply the parts
 * individually: `<Input defaultValue={inputProps.defaultValue} onChange={inputProps.onChange} input={{ ref: inputProps.ref }} />`.
 * @internal
 */
export interface PlainTextInputProps {
	/** Callback ref so the hook can read/write the element's value and selection. */
	readonly ref: RefCallback<TextInputElement>;
	/**
	 * The element's initial content. The element is left **uncontrolled** — after mount the hook
	 * keeps it in sync imperatively via incremental deltas, so typing does not trigger a re-render.
	 */
	readonly defaultValue: string;
	/** Write local edits into the tree. */
	readonly onChange: ChangeEventHandler<TextInputElement>;
}

/**
 * The return value of {@link usePlainTextInput}.
 * @internal
 */
export interface PlainTextInputBinding {
	/** Spread onto an uncontrolled `<input>` / `<textarea>`. See {@link PlainTextInputProps}. */
	readonly inputProps: PlainTextInputProps;
	/** Focus the bound element (e.g. for a click-anywhere-to-focus container). */
	readonly focus: () => void;
}

/**
 * React hook that two-way binds an (uncontrolled) text input to a
 * {@link @fluidframework/tree#TextAsTree.Tree}, returning spreadable input props.
 * @remarks
 * This is the headless convenience layer over the pure {@link applyTextOps} / {@link applyTextEdit}
 * functions: it owns the glue that is easy to get wrong when wiring an editor by hand — subscribing
 * to {@link @fluidframework/tree#TextAsTree.Members.onCharactersChanged} (and re-attaching when
 * {@link UsePlainTextInputOptions.text} is lazily assigned or swapped), applying incremental remote
 * deltas via {@link applyTextOps} (with a full re-read fallback) while preserving the caret, and a
 * re-entrancy guard so a local edit's own echo is not re-applied.
 *
 * The element is left **uncontrolled** and updated imperatively, so typing does not trigger a React
 * re-render. The hook works with any element exposing `value` + selection (`<input>`, `<textarea>`,
 * or a component-library input via its slot ref).
 *
 * For non-`<input>` UIs (contenteditable, CodeMirror, canvas) or non-React renderers, use the pure
 * {@link applyTextOps} / {@link applyTextEdit} functions directly.
 *
 * If you instead need a **controlled** input (React owns the value — e.g. it also feeds form state,
 * validation, or a library input that does not forward a DOM ref), compose the same pure functions:
 *
 * ```tsx
 * const updating = useRef(false);
 * const [value, setValue] = useState(() => text.fullString());
 * useEffect(
 *   () =>
 *     text.onCharactersChanged((ops) => {
 *       if (updating.current) return; // ignore our own edit's echo
 *       // Re-reads the whole string for brevity. To apply incrementally and preserve the caret,
 *       // call applyTextOps(value, selection, ops) with the element's current selection and restore
 *       // the returned selection in a useLayoutEffect (this hook does the imperative equivalent).
 *       setValue(text.fullString());
 *     }),
 *   [text],
 * );
 * const onChange = (e) => {
 *   setValue(e.target.value);
 *   updating.current = true;
 *   try {
 *     applyTextEdit(text, e.target.value);
 *   } finally {
 *     updating.current = false;
 *   }
 * };
 * // <input value={value} onChange={onChange} />
 * ```
 * @internal
 */
export function usePlainTextInput(options: UsePlainTextInputOptions): PlainTextInputBinding {
	const { text, editLabel, applyEdit = applyTextEdit, undoRedo } = options;

	// The bound element; needed to read/write its value and caret/selection.
	const elementRef = useRef<TextInputElement | undefined>(undefined);
	// Guards against re-applying the echo of our own local edit.
	const isUpdatingRef = useRef<boolean>(false);
	// Re-render trigger used only to refresh undo/redo button state (when `undoRedo` is provided).
	const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
	// Latest `undoRedo`, readable from event callbacks without making the subscription effect
	// re-run (and re-seed the element) whenever `undoRedo` changes identity.
	const undoRedoRef = useRef(undoRedo);
	undoRedoRef.current = undoRedo;

	// Effective label: explicit option or the text node itself as the default.
	const effectiveLabel = editLabel ?? text;

	// Computed once: an uncontrolled element only reads `defaultValue` at mount. Later content (and
	// node swaps) are pushed into the element imperatively by the effect below.
	const [defaultValue] = useState<string>(() => text?.fullString() ?? "");

	// Tree → element: seed the element with the current node's content and subscribe to its changes.
	// Re-runs when `text` is (re)assigned, so a lazily-populated or swapped node is picked up.
	useEffect(() => {
		if (text === undefined) {
			return;
		}

		// Reflect the (possibly new) node's content into the uncontrolled element. On a node swap
		// the element briefly shows the previous node's value until this runs (one frame).
		const seedElement = elementRef.current;
		if (seedElement !== undefined) {
			seedElement.value = text.fullString();
		}

		return text.onCharactersChanged((ops) => {
			// Ignore the echo of our own local edit.
			if (isUpdatingRef.current) {
				return;
			}
			const element = elementRef.current;
			if (element === undefined) {
				return;
			}

			let newValue: string;
			let newSelection: TextSelection | undefined;
			if (ops === undefined) {
				// Delta unavailable — fall back to a full re-read.
				newValue = text.fullString();
			} else {
				// Apply ops incrementally to avoid a full O(N) re-read, adjusting the caret.
				// `selectionStart`/`selectionEnd` are `number | null`; fall back to the end of the text.
				const result = applyTextOps(
					element.value,
					{
						start: element.selectionStart ?? element.value.length,
						end: element.selectionEnd ?? element.value.length,
					},
					ops,
				);
				newValue = result.value;
				newSelection = result.selection;
			}
			element.value = newValue;
			if (newSelection !== undefined) {
				element.setSelectionRange(newSelection.start, newSelection.end);
			}
			// Refresh undo/redo button state — only re-renders when an undo/redo manager is in use.
			if (undoRedoRef.current !== undefined) {
				forceUpdate();
			}
		});
	}, [text]);

	// Element → tree: write the user's edit back into the tree (guarded against the resulting echo).
	const onChange = useCallback<ChangeEventHandler<TextInputElement>>(
		(event) => {
			if (isUpdatingRef.current || text === undefined) {
				return;
			}
			isUpdatingRef.current = true;
			try {
				applyEdit(text, event.target.value, effectiveLabel);
			} finally {
				isUpdatingRef.current = false;
			}
			// Refresh undo/redo button state: this edit's own echo is skipped by the guard in the
			// subscription, so a local edit's refresh has to happen here.
			if (undoRedoRef.current !== undefined) {
				forceUpdate();
			}
		},
		[text, applyEdit, effectiveLabel],
	);

	const ref = useCallback<RefCallback<TextInputElement>>((element) => {
		elementRef.current = element ?? undefined;
	}, []);

	const focus = useCallback((): void => {
		elementRef.current?.focus();
	}, []);

	return {
		inputProps: { ref, defaultValue, onChange },
		focus,
	};
}
