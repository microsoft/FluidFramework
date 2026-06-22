/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextAsTree } from "@fluidframework/tree/internal";
import { type ChangeEvent, type FC, useCallback, useEffect, useReducer, useRef } from "react";

import { unwrapPropTreeNode, type PropTreeNode } from "../../propNode.js";
import type { TextEditorProps } from "../textEditorProps.js";

import { applyTextEdit, applyTextOps, type TextSelection } from "./plainUtils.js";

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
				let newSelection: TextSelection | undefined;
				if (ops === undefined) {
					// Delta unavailable — fall back to full re-read.
					newValue = root.fullString();
				} else {
					// Apply ops incrementally to avoid a full O(N) re-read.
					const result = applyTextOps(
						textarea.value,
						{ start: textarea.selectionStart, end: textarea.selectionEnd },
						ops,
					);
					newValue = result.value;
					newSelection = result.selection;
				}
				textarea.value = newValue;
				// Keep the DOM's child text node in sync with `.value` so queries like
				// `element.textContent` (used in tests / by external observers) reflect current
				// content rather than the initial value baked in from `defaultValue`.
				textarea.textContent = newValue;
				if (newSelection !== undefined) {
					textarea.setSelectionRange(newSelection.start, newSelection.end);
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
				applyTextEdit(root, event.target.value, effectiveLabel);
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
