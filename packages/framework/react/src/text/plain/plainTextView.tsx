/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeAlpha, type TextAsTree } from "@fluidframework/tree/internal";
import { type ChangeEvent, type FC, useCallback, useLayoutEffect, useRef } from "react";

import { unwrapPropTreeNode, type PropTreeNode } from "../../propNode.js";
import type { TextEditorProps } from "../textEditorProps.js";

import { syncTextToTree } from "./plainUtils.js";
import { useTreeSynchronizedString } from "./useTreeSynchronizedString.js";

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
 * A controlled textarea driven by {@link useTreeSynchronizedString} (tree → string); local edits
 * are written back to the tree via {@link syncTextToTree}, wrapped in a transaction so each edit is
 * atomically undoable/redoable (string → tree). Doubles as a reference
 * for binding a text input to a {@link @fluidframework/tree#TextAsTree.Tree}.
 */
const PlainTextEditorView: FC<MainViewPropsInner> = ({ root, undoRedo, editLabel }) => {
	const effectiveLabel = editLabel ?? root;
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	// Distinguishes the local user's own edit (browser keeps the caret) from a remote one.
	const isLocalEditRef = useRef<boolean>(false);

	// Tree → string (one-way). The component supplies the other direction below.
	const { text, selection } = useTreeSynchronizedString(root);

	// A controlled value resets the caret on every change. For the user's own edit the browser
	// already placed the caret correctly, so only restore the tracked selection for remote edits.
	useLayoutEffect(() => {
		if (isLocalEditRef.current) {
			isLocalEditRef.current = false;
			return;
		}
		const textarea = textareaRef.current;
		if (textarea !== null && selection !== undefined) {
			textarea.setSelectionRange(selection.start, selection.end);
		}
	}, [text, selection]);

	// String → tree: write the user's edit back into the tree. `syncTextToTree` already applies its
	// edits atomically; this outer transaction just tags them with `effectiveLabel` for undo/redo.
	const onChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			isLocalEditRef.current = true;
			TreeAlpha.context(root).runTransaction(() => syncTextToTree(root, event.target.value), {
				label: effectiveLabel,
			});
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
				value={text}
				onChange={onChange}
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
