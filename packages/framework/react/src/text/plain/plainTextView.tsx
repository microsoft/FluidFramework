/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeAlpha } from "@fluidframework/tree/internal";
import type { TextAsTree } from "@fluidframework/tree/internal";
import { type ChangeEvent, type FC, useCallback, useRef } from "react";

import type { PropTreeNode } from "../../propNode.js";
import { withMemoizedTreeObservations } from "../../useTree.js";
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
	return <PlainTextEditorView root={root} undoRedo={undoRedo} editLabel={editLabel} />;
};

const PlainTextEditorView = withMemoizedTreeObservations(
	({ root, undoRedo, editLabel }: MainViewPropsInner) => {
		// Reference to the textarea element
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		// Guards against update loops between textarea and the tree
		const isUpdatingRef = useRef<boolean>(false);

		// Access tree content during render to establish observation.
		// The HOC will automatically re-render when this content changes.
		const currentText = root.fullString();

		// Effective label: explicit prop or the root node itself as the default.
		const effectiveLabel = editLabel ?? root;

		// Handle textarea changes - sync textarea → tree
		const handleChange = useCallback(
			(event: ChangeEvent<HTMLTextAreaElement>) => {
				if (isUpdatingRef.current) {
					return;
				}

				isUpdatingRef.current = true;

				const newText = event.target.value;
				const context = TreeAlpha.context(root);
				if (context.isBranch()) {
					context.runTransaction(() => syncTextToTree(root, newText), {
						label: effectiveLabel,
					});
				} else {
					syncTextToTree(root, newText);
				}

				isUpdatingRef.current = false;
			},
			[root, effectiveLabel],
		);

		// Sync textarea when tree changes externally.
		// We skip this if isUpdatingRef is true, meaning we caused the tree change ourselves
		// via the handleChange above - in that case textarea already has the correct content.
		if (textareaRef.current && !isUpdatingRef.current) {
			const textareaValue = textareaRef.current.value;

			// Only update if content actually differs (avoids cursor jump on local edits)
			if (textareaValue !== currentText) {
				isUpdatingRef.current = true;

				// Preserve cursor position
				const selectionStart = textareaRef.current.selectionStart;
				const selectionEnd = textareaRef.current.selectionEnd;

				textareaRef.current.value = currentText;

				// Restore cursor position, clamped to new text length
				const newPosition = Math.min(selectionStart, currentText.length);
				const newEnd = Math.min(selectionEnd, currentText.length);
				textareaRef.current.setSelectionRange(newPosition, newEnd);

				isUpdatingRef.current = false;
			}
		}

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
					defaultValue={currentText}
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
	},
);
