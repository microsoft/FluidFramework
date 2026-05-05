/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type TextAsTree,
	TreeAlpha,
	utf16LengthForCodePoints,
} from "@fluidframework/tree/internal";
import {
	type ChangeEvent,
	type FC,
	useCallback,
	useEffect,
	useReducer,
	useRef,
} from "react";

import { unwrapPropTreeNode, type PropTreeNode } from "../../propNode.js";
import type { TextEditorProps } from "../textEditorProps.js";

import { syncTextToTree } from "./plainUtils.js";

/**
 * Props for the MainView component.
 * @input @internal
 */
export interface MainViewProps extends TextEditorProps {
	/** The plain text tree to edit. */
	readonly root: PropTreeNode<TextAsTree.Tree>;
}

type MainViewPropsInner = Omit<MainViewProps, "root"> & {
	readonly root: TextAsTree.Tree;
};

/**
 * A React component for plain text editing.
 * @remarks
 * Uses {@link @fluidframework/tree#TextAsTree.Tree} for the data-model and an HTML textarea for the UI.
 * Pass an `undoRedo` prop to enable undo/redo buttons scoped to this editor's transactions.
 * @internal
 */
export const MainView: FC<MainViewProps> = ({ root, undoRedo, editLabel }) => {
	return (
		<PlainTextEditorView
			root={unwrapPropTreeNode(root)}
			undoRedo={undoRedo}
			editLabel={editLabel}
		/>
	);
};

/**
 * A plain text editor view component using a native HTML textarea.
 * Uses TextAsTree for collaborative plain text storage.
 *
 * @remarks
 * Subscribes to incremental character-level deltas from the tree via
 * {@link @fluidframework/tree#TextAsTree.Members.onCharactersChanged} to apply
 * remote changes to the textarea without a full re-read of the text.
 */
const PlainTextEditorView: FC<MainViewPropsInner> = ({ root, undoRedo, editLabel }) => {
	// Reference to the textarea element
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	// Guards against update loops between textarea and the tree
	const isUpdatingRef = useRef<boolean>(false);
	// Force re-render when undo/redo state changes so button disabled state stays current.
	const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

	// Effective label: explicit prop or the root node itself as the default.
	const effectiveLabel = editLabel ?? root;

	// Subscribe to incremental tree changes and apply them to the textarea.
	useEffect(() => {
		return root.onCharactersChanged((ops) => {
			if (isUpdatingRef.current || !textareaRef.current) {
				return;
			}

			isUpdatingRef.current = true;
			try {
				const textarea = textareaRef.current;
				let newValue: string;
				let newCursorStart: number | undefined;
				let newCursorEnd: number | undefined;
				if (ops === undefined) {
					// Delta unavailable — fall back to full re-read.
					newValue = root.fullString();
				} else {
					// Apply ops incrementally to avoid a full O(N) re-read.
					const selectionStart = textarea.selectionStart;
					const selectionEnd = textarea.selectionEnd;

					// readPos is a UTF-16 code-unit index into oldValue.
					// op.count is in Unicode code points; we convert via utf16LengthForCodePoints.
					let readPos = 0;
					const oldValue = textarea.value;
					newValue = "";
					newCursorStart = selectionStart;
					newCursorEnd = selectionEnd;

					for (const op of ops) {
						if (op.type === "retain") {
							// Convert atom count to UTF-16 units by scanning the actual characters.
							const utf16Count = utf16LengthForCodePoints(oldValue, readPos, op.count);
							newValue += oldValue.slice(readPos, readPos + utf16Count);
							readPos += utf16Count;
						} else if (op.type === "insert") {
							// op.text is a JS string; use its UTF-16 length for cursor adjustment.
							if (readPos <= selectionStart) {
								newCursorStart += op.text.length;
							}
							if (readPos <= selectionEnd) {
								newCursorEnd += op.text.length;
							}
							newValue += op.text;
						} else {
							// remove
							// Convert atom count to UTF-16 units before adjusting cursors.
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
					newValue += oldValue.slice(readPos);
				}
				textarea.value = newValue;
				// Keep the DOM's child text node in sync with `.value` so queries like
				// `element.textContent` (used in tests / by external observers) reflect current
				// content rather than the initial value baked in from `defaultValue`.
				textarea.textContent = newValue;
				if (newCursorStart !== undefined && newCursorEnd !== undefined) {
					const clampedStart = Math.min(newCursorStart, newValue.length);
					const clampedEnd = Math.min(newCursorEnd, newValue.length);
					textarea.setSelectionRange(clampedStart, clampedEnd);
				}
			} finally {
				isUpdatingRef.current = false;
			}
			// Refresh undo/redo button state — undo/redo availability changes alongside tree mutations.
			if (undoRedo) forceUpdate();
		});
	}, [root, undoRedo]);

	// Handle textarea changes - sync textarea → tree
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			if (isUpdatingRef.current) {
				return;
			}

			isUpdatingRef.current = true;
			try {
				const newText = event.target.value;
				const context = TreeAlpha.context(root);
				if (context.isBranch()) {
					context.runTransaction(() => syncTextToTree(root, newText), {
						label: effectiveLabel,
					});
				} else {
					syncTextToTree(root, newText);
				}
			} finally {
				isUpdatingRef.current = false;
			}
		},
		[root, effectiveLabel],
	);

	return (
		<div
			className="text-editor-container"
			style={{ height: "100%", display: "flex", flexDirection: "column" }}
			onClick={() => textareaRef.current?.focus()}
		>
			<style>{`
				.pt-toolbar {
					display: flex;
					align-items: center;
					padding: 4px 8px;
					background: #f8f9fa;
					border: 1px solid #ccc;
					border-radius: 4px 4px 0 0;
				}
				.pt-undo, .pt-redo {
					width: 28px;
					height: 28px;
					padding: 0;
					background: none;
					border: none;
					cursor: pointer;
					font-size: 18px;
					display: flex;
					align-items: center;
					justify-content: center;
				}
				.pt-undo::after { content: "↶"; }
				.pt-redo::after { content: "↷"; }
				.pt-undo:disabled, .pt-redo:disabled { opacity: 0.3; cursor: not-allowed; }
			`}</style>
			{undoRedo !== undefined && (
				<div className="pt-toolbar">
					<button
						type="button"
						className="pt-undo"
						aria-label="Undo"
						disabled={!undoRedo.canUndo(effectiveLabel)}
						onClick={() => undoRedo.undo(effectiveLabel)}
						title="Undo"
					/>
					<button
						type="button"
						className="pt-redo"
						aria-label="Redo"
						disabled={!undoRedo.canRedo(effectiveLabel)}
						onClick={() => undoRedo.redo(effectiveLabel)}
						title="Redo"
					/>
				</div>
			)}
			<textarea
				ref={textareaRef}
				defaultValue={root.fullString()}
				onChange={handleChange}
				placeholder="Start typing..."
				style={{
					flex: 1,
					minHeight: "300px",
					border: "1px solid #ccc",
					borderRadius: undoRedo === undefined ? "4px" : "0 0 4px 4px",
					padding: "8px",
					fontSize: "14px",
					fontFamily: "inherit",
					resize: "vertical",
				}}
			/>
		</div>
	);
};
