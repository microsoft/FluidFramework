/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	withMemoizedTreeObservations,
	syncTextToTree,
	type PropTreeNode,
	type LabeledUndoRedo,
} from "@fluidframework/react/internal";
import { TreeAlpha } from "@fluidframework/tree/internal";
import type { TextAsTree } from "@fluidframework/tree/internal";
import Quill from "quill";
import { type FC, useEffect, useRef, useState } from "react";
import * as ReactDOM from "react-dom";

/**
 * Props for the MainView component.
 * @input @internal
 */
export interface MainViewProps {
	/** The plain text tree to edit. */
	readonly root: PropTreeNode<TextAsTree.Tree>;
	/**
	 * Optional undo/redo manager and transaction label.
	 * When provided, undo/redo toolbar buttons are rendered and each user edit is
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
 * Uses {@link @fluidframework/tree#TextAsTree.Tree} for the data-model and Quill for the UI.
 * Pass an `undoRedo` prop to enable undo/redo buttons scoped to this editor's transactions.
 * @internal
 */
export const MainView: FC<MainViewProps> = ({ root, undoRedo }) => {
	return <TextEditorView root={root} undoRedo={undoRedo} />;
};

const TextEditorView = withMemoizedTreeObservations(
	({
		root,
		undoRedo,
	}: {
		root: TextAsTree.Tree;
		undoRedo?: { manager: LabeledUndoRedo; transactionLabel: symbol };
	}) => {
		// DOM element where Quill will mount its editor
		const editorRef = useRef<HTMLDivElement>(null);
		// Quill instance, persisted across renders to avoid re-initialization
		const quillRef = useRef<Quill | undefined>(undefined);
		// Guards against update loops between Quill and the tree
		const isUpdatingRef = useRef<boolean>(false);
		// Container element for undo/redo button portal
		const [undoRedoContainer, setUndoRedoContainer] = useState<HTMLElement | undefined>(
			undefined,
		);
		// Ref so the one-time Quill setup effect always sees the current undoRedo value.
		const undoRedoRef = useRef(undoRedo);
		undoRedoRef.current = undoRedo;

		// Access tree content during render to establish observation.
		// The HOC will automatically re-render when this content changes.
		const currentText = root.fullString();

		// Initialize Quill editor
		useEffect(() => {
			if (!editorRef.current || quillRef.current) {
				return;
			}

			const quill = new Quill(editorRef.current, {
				theme: "snow",
				placeholder: "Start typing...",
				modules: {
					history: false, // Disable Quill's built-in undo/redo
					toolbar: [], // Empty toolbar — we add undo/redo buttons via React portal
				},
			});

			// Set initial content from tree (add trailing newline to match Quill's convention)
			const initialText = root.fullString();
			if (initialText.length > 0) {
				const textWithNewline = initialText.endsWith("\n")
					? initialText
					: `${initialText}\n`;
				quill.setText(textWithNewline);
			}

			// Listen to local Quill changes
			const handleTextChange = (
				_delta: unknown,
				_oldDelta: unknown,
				source: string,
			): void => {
				if (source === "user" && !isUpdatingRef.current) {
					isUpdatingRef.current = true;

					const newText = quill.getText();
					// TODO: Consider using delta from Quill to compute a more minimal update,
					// and maybe add a debugAssert that the delta actually gets the strings synchronized.
					const context = TreeAlpha.context(root);
					if (context.isBranch()) {
						context.runTransaction(() => syncTextToTree(root, newText), {
							// Use ref so this closure always sees the latest label even if undoRedo changes.
							label: undoRedoRef.current?.transactionLabel,
						});
					} else {
						syncTextToTree(root, newText);
					}

					isUpdatingRef.current = false;
				}
			};

			quill.on("text-change", handleTextChange);
			quillRef.current = quill;

			// Create container for React-controlled undo/redo buttons and prepend to toolbar
			const toolbar = editorRef.current.previousElementSibling as HTMLElement;
			const container = document.createElement("span");
			container.className = "ql-formats";
			toolbar.prepend(container);
			setUndoRedoContainer(container);

			// Capture for cleanup — editorRef.current may have changed by then.
			const editor = editorRef.current;
			return () => {
				quill.off("text-change", handleTextChange);
				quillRef.current = undefined;
				editor.innerHTML = "";
				editor.className = "";
				toolbar.remove();
			};
			// In React strict mode, effects run twice. The `!quillRef.current` check above
			// makes the second call a no-op, preventing double-initialization of Quill.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);

		// Sync Quill when tree changes externally.
		// We skip this if isUpdatingRef is true, meaning we caused the tree change ourselves
		// via the text-change handler above - in that case Quill already has the correct content.
		// No update is lost because isUpdatingRef is only true synchronously during our own
		// handler execution, so Quill already reflects the change.
		if (quillRef.current && !isUpdatingRef.current) {
			const quillText = quillRef.current.getText();
			// Normalize tree text to match Quill's trailing newline convention
			const treeTextWithNewline = currentText.endsWith("\n")
				? currentText
				: `${currentText}\n`;

			// Only update if content actually differs (avoids cursor jump on local edits)
			if (quillText !== treeTextWithNewline) {
				isUpdatingRef.current = true;

				const selection = quillRef.current.getSelection();
				quillRef.current.setText(treeTextWithNewline);
				if (selection) {
					const length = quillRef.current.getLength();
					const newPosition = Math.min(selection.index, length - 1);
					quillRef.current.setSelection(newPosition, 0);
				}

				isUpdatingRef.current = false;
			}
		}

		// Render undo/redo buttons via portal into Quill toolbar
		const undoRedoButtons = undoRedoContainer
			? ReactDOM.createPortal(
					<>
						<button
							type="button"
							className="ql-undo"
							disabled={undoRedo?.manager.canUndo(undoRedo.transactionLabel) !== true}
							onClick={() => undoRedo?.manager.undo(undoRedo.transactionLabel)}
						/>
						<button
							type="button"
							className="ql-redo"
							disabled={undoRedo?.manager.canRedo(undoRedo.transactionLabel) !== true}
							onClick={() => undoRedo?.manager.redo(undoRedo.transactionLabel)}
						/>
					</>,
					undoRedoContainer,
				)
			: undefined;

		return (
			<div
				className="text-editor-container"
				style={{ height: "100%", display: "flex", flexDirection: "column" }}
				onClick={() => quillRef.current?.focus()}
			>
				<style>{`
					.ql-container { height: 100%; font-size: 14px; }
					.ql-editor { height: 100%; outline: none; }
					.ql-editor.ql-blank::before { color: #999; font-style: italic; }
					.ql-toolbar { border-radius: 4px 4px 0 0; background: #f8f9fa; }
					.ql-container.ql-snow { border-radius: 0 0 4px 4px; }
					.ql-undo, .ql-redo { width: 28px !important; }
					.ql-undo::after { content: "↶"; font-size: 18px; }
					.ql-redo::after { content: "↷"; font-size: 18px; }
					.ql-undo:disabled, .ql-redo:disabled { opacity: 0.3; cursor: not-allowed; }
				`}</style>
				<div
					ref={editorRef}
					style={{
						flex: 1,
						minHeight: "300px",
						border: "1px solid #ccc",
						borderRadius: "4px",
						cursor: "text",
					}}
				/>
				{undoRedoButtons}
			</div>
		);
	},
);
