/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	syncTextToTree,
	unwrapPropTreeNode,
	type PropTreeNode,
	type TextEditorProps,
} from "@fluidframework/react/internal";
import {
	type TextAsTree,
	TreeAlpha,
	utf16LengthForCodePoints,
} from "@fluidframework/tree/internal";
import Quill from "quill";
import type { Op } from "quill-delta";
import { type FC, useEffect, useReducer, useRef, useState } from "react";
import * as ReactDOM from "react-dom";

import { runGuarded } from "../shared/index.js";

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
 * Uses {@link @fluidframework/tree#TextAsTree.Tree} for the data-model and Quill for the UI.
 * Pass an `undoRedo` prop to enable undo/redo buttons scoped to this editor's transactions.
 * @internal
 */
export const MainView: FC<MainViewProps> = ({ root, undoRedo, editLabel }) => {
	return (
		<TextEditorView
			root={unwrapPropTreeNode(root)}
			undoRedo={undoRedo}
			editLabel={editLabel}
		/>
	);
};

/**
 * The text editor view component with Quill integration.
 * Uses TextAsTree for collaborative plain text storage.
 *
 * @remarks
 * Subscribes to incremental character-level deltas from the tree via
 * {@link @fluidframework/tree#TextAsTree.Members.onCharactersChanged} to apply
 * remote changes through {@link https://quilljs.com/docs/delta/ | Quill Delta} without
 * a full setText on every change.
 */
const TextEditorView: FC<MainViewPropsInner> = ({ root, undoRedo, editLabel }) => {
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
	// Force re-render when undo/redo state changes so button disabled state stays current.
	const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

	// Effective label: explicit prop or the root node itself as the default.
	const effectiveLabel = editLabel ?? root;
	// Ref so the one-time Quill setup effect always sees the current effective label.
	const editLabelRef = useRef(effectiveLabel);
	editLabelRef.current = effectiveLabel;

	// Initialize Quill editor. Runs once on mount.
	// In React strict mode, effects run twice. The `!quillRef.current` check makes the second
	// call a no-op, preventing double-initialization of Quill.
	// eslint-disable-next-line react-hooks/exhaustive-deps
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
			const textWithNewline = initialText.endsWith("\n") ? initialText : `${initialText}\n`;
			quill.setText(textWithNewline);
		}

		// Listen to local Quill changes — sync Quill → tree.
		// Edits are wrapped in a labeled transaction (when the node is on a branch) so that
		// undo/redo can target only this editor's commits.
		const handleTextChange = (_delta: unknown, _oldDelta: unknown, source: string): void => {
			if (source !== "user") return;
			runGuarded(isUpdatingRef, () => {
				const context = TreeAlpha.context(root);
				if (context.isBranch()) {
					context.runTransaction(() => syncTextToTree(root, quill.getText()), {
						label: editLabelRef.current,
					});
				} else {
					syncTextToTree(root, quill.getText());
				}
			});
		};

		quill.on("text-change", handleTextChange);
		quillRef.current = quill;

		// Create container for React-controlled undo/redo buttons and prepend to toolbar
		const editor = editorRef.current;
		const toolbar = editor.previousElementSibling as HTMLElement;
		const container = document.createElement("span");
		container.className = "ql-formats";
		toolbar.prepend(container);
		setUndoRedoContainer(container);

		return () => {
			quill.off("text-change", handleTextChange);
			quillRef.current = undefined;
			setUndoRedoContainer(undefined);
			// Clear Quill's DOM modifications so the container is clean for any remount.
			toolbar.remove();
			editor.innerHTML = "";
			editor.className = "";
		};
	}, []);

	// Subscribe to incremental tree changes — sync tree → Quill.
	// Kept in a separate effect so it re-subscribes correctly after React strict mode cleanup,
	// independent of the Quill initialization guard above.
	// Also forces a re-render after each change so undo/redo button disabled state
	// (which depends on canUndo/canRedo) stays in sync with the tree.
	useEffect(() => {
		return root.onCharactersChanged((ops) => {
			runGuarded(isUpdatingRef, () => {
				const quill = quillRef.current;
				if (!quill) return;
				if (ops === undefined) {
					// Delta unavailable — fall back to full setText.
					const text = root.fullString();
					const normalized = text.endsWith("\n") ? text : `${text}\n`;
					const selection = quill.getSelection();
					quill.setText(normalized);
					if (selection) {
						const length = quill.getLength();
						quill.setSelection(Math.min(selection.index, length - 1), 0);
					}
				} else {
					// Translate TextOp[] to a Quill delta and apply incrementally.
					// op.count is in Unicode code points; Quill uses UTF-16 code units.
					// Read the pre-edit Quill content once and use it to compute UTF-16 widths
					// for retain and delete ops.
					const preEditContent = quill.getText();
					let quillPos = 0;
					const quillOps: Op[] = [];
					for (const op of ops) {
						if (op.type === "retain") {
							const utf16Count = utf16LengthForCodePoints(preEditContent, quillPos, op.count);
							quillOps.push({ retain: utf16Count });
							quillPos += utf16Count;
						} else if (op.type === "insert") {
							// op.text is a JS string — Quill handles its UTF-16 encoding automatically.
							quillOps.push({ insert: op.text });
							// quillPos does not advance: inserts are new content not in preEditContent.
						} else {
							const utf16Count = utf16LengthForCodePoints(preEditContent, quillPos, op.count);
							quillOps.push({ delete: utf16Count });
							quillPos += utf16Count;
						}
					}
					quill.updateContents({ ops: quillOps }, "api");
				}
			});
			// Refresh undo/redo button state.
			if (undoRedo) forceUpdate();
		});
	}, [root, undoRedo]);

	// Render undo/redo buttons via portal into Quill toolbar
	const undoRedoButtons = undoRedoContainer
		? ReactDOM.createPortal(
				<>
					<button
						type="button"
						className="ql-undo"
						aria-label="Undo"
						disabled={undoRedo?.canUndo(effectiveLabel) !== true}
						onClick={() => undoRedo?.undo(effectiveLabel)}
					/>
					<button
						type="button"
						className="ql-redo"
						aria-label="Redo"
						disabled={undoRedo?.canRedo(effectiveLabel) !== true}
						onClick={() => undoRedo?.redo(effectiveLabel)}
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
};
