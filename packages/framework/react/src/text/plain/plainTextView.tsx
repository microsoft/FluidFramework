/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextAsTree } from "@fluidframework/tree/internal";
import type { FC } from "react";

import { unwrapPropTreeNode, type PropTreeNode } from "../../propNode.js";
import type { TextEditorProps } from "../textEditorProps.js";

import { usePlainTextInput } from "./usePlainTextInput.js";

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
	// All input ↔ tree binding lives in the hook; `undoRedo` is forwarded so it keeps the toolbar's
	// enabled state in sync.
	const { inputProps, focus } = usePlainTextInput({ text: root, editLabel, undoRedo });

	// Effective label: explicit prop or the root node itself as the default (for the undo/redo buttons).
	const effectiveLabel = editLabel ?? root;

	return (
		<div
			className="text-editor-container"
			style={{ height: "100%", display: "flex", flexDirection: "column" }}
			onClick={focus}
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
				{...inputProps}
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
