/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeAlpha } from "@fluidframework/tree/internal";
import type { TextAsTree } from "@fluidframework/tree/internal";
import { type ChangeEvent, type FC, useCallback, useRef } from "react";

import type { PropTreeNode } from "../../propNode.js";
import type { LabeledUndoRedo } from "../../undoRedo.js";
import { withMemoizedTreeObservations } from "../../useTree.js";

import { syncTextToTree } from "./plainUtils.js";

/**
 * Props for the MainView component.
 * @internal
 */
export interface MainViewProps {
	/** The plain text tree to edit. */
	readonly root: PropTreeNode<TextAsTree.Tree>;
	/**
	 * Optional undo/redo manager and transaction label.
	 * @remarks
	 * When provided, undo/redo buttons are rendered and each user edit is
	 * committed under `label` so it can be undone/redone independently of edits
	 * made by other components sharing the same {@link LabeledUndoRedo} manager.
	 */
	readonly undoRedo?: {
		/** The undo/redo manager shared across editors. */
		readonly manager: LabeledUndoRedo;
		/** Symbol that identifies this editor's commits within the shared manager. */
		readonly transactionLabel: symbol;
	};
}

/**
 * A React component for plain text editing.
 * @remarks
 * Uses {@link @fluidframework/tree#TextAsTree.Tree} for the data-model and an HTML textarea for the UI.
 * Pass an `undoRedo` prop to enable undo/redo buttons scoped to this editor's transactions.
 * @internal
 */
export const MainView: FC<MainViewProps> = ({ root, undoRedo }) => {
	return <PlainTextEditorView root={root} undoRedo={undoRedo} />;
};

const PlainTextEditorView = withMemoizedTreeObservations(
	({ root, undoRedo }: MainViewProps) => {
		// Reference to the textarea element
		const textareaRef = useRef<HTMLTextAreaElement>(null);
		// Guards against update loops between textarea and the tree
		const isUpdatingRef = useRef<boolean>(false);

		// Access tree content during render to establish observation.
		// The HOC will automatically re-render when this content changes.
		const currentText = root.fullString();

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
						label: undoRedo?.transactionLabel,
					});
				} else {
					syncTextToTree(root, newText);
				}

				isUpdatingRef.current = false;
			},
			[root, undoRedo],
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
			>
				<h2 style={{ margin: "10px 0" }}>Collaborative Text Editor</h2>
				{undoRedo !== undefined && (
					<div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
						<button
							type="button"
							disabled={!undoRedo.manager.canUndo(undoRedo.transactionLabel)}
							onClick={() => undoRedo.manager.undo(undoRedo.transactionLabel)}
						>
							↶ Undo
						</button>
						<button
							type="button"
							disabled={!undoRedo.manager.canRedo(undoRedo.transactionLabel)}
							onClick={() => undoRedo.manager.redo(undoRedo.transactionLabel)}
						>
							↷ Redo
						</button>
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
						borderRadius: "4px",
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
