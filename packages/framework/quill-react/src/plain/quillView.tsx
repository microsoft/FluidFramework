/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	syncTextToTree,
	unwrapPropTreeNode,
	type PropTreeNode,
} from "@fluidframework/react/internal";
import { type TextAsTree, utf16LengthForCodePoints } from "@fluidframework/tree/internal";
import Quill from "quill";
import type { Op } from "quill-delta";
import { type FC, useEffect, useRef } from "react";

import { runOnce } from "../shared/index.js";

/**
 * Props for the MainView component.
 * @input @internal
 */
export interface MainViewProps {
	root: PropTreeNode<TextAsTree.Tree>;
}

/**
 * A React component for plain text editing.
 * @remarks
 * Uses {@link @fluidframework/tree#TextAsTree.Tree} for the data-model and Quill for the UI.
 * @internal
 */
export const MainView: FC<MainViewProps> = ({ root }) => {
	return <TextEditorView root={unwrapPropTreeNode(root)} />;
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
const TextEditorView: FC<{ root: TextAsTree.Tree }> = ({ root }) => {
	// DOM element where Quill will mount its editor
	const editorRef = useRef<HTMLDivElement>(null);
	// Quill instance, persisted across renders to avoid re-initialization
	const quillRef = useRef<Quill | undefined>(undefined);
	// Guards against update loops between Quill and the tree
	const isUpdatingRef = useRef<boolean>(false);

	// Initialize Quill editor. Runs once on mount.
	// In React strict mode, effects run twice. The `!quillRef.current` check makes the second
	// call a no-op, preventing double-initialization of Quill.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (!editorRef.current || quillRef.current) {
			return;
		}

		const quill = new Quill(editorRef.current, {
			placeholder: "Start typing...",
		});

		// Set initial content from tree (add trailing newline to match Quill's convention)
		const initialText = root.fullString();
		if (initialText.length > 0) {
			const textWithNewline = initialText.endsWith("\n") ? initialText : `${initialText}\n`;
			quill.setText(textWithNewline);
		}

		// Listen to local Quill changes — sync Quill → tree.
		const handleTextChange = (_delta: unknown, _oldDelta: unknown, source: string): void => {
			if (source !== "user") return;
			runOnce(isUpdatingRef, () => {
				syncTextToTree(root, quill.getText());
			});
		};

		quill.on("text-change", handleTextChange);
		quillRef.current = quill;

		// Capture for cleanup — editorRef.current may have changed by then.
		const editor = editorRef.current;
		return () => {
			quill.off("text-change", handleTextChange);
			quillRef.current = undefined;
			// Clear Quill's DOM modifications so the container is clean for any remount.
			editor.innerHTML = "";
			editor.className = "";
		};
	}, []);

	// Subscribe to incremental tree changes — sync tree → Quill.
	// Kept in a separate effect so it re-subscribes correctly after React strict mode cleanup,
	// independent of the Quill initialization guard above.
	useEffect(() => {
		return root.onCharactersChanged((ops) => {
			runOnce(isUpdatingRef, () => {
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
					return;
				}
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
			});
		});
	}, [root]);

	return (
		<div
			className="text-editor-container"
			style={{ height: "100%", display: "flex", flexDirection: "column" }}
			onClick={() => quillRef.current?.focus()}
		>
			<style>
				{`
					.ql-container {
						height: 100%;
						font-size: 14px;
					}
					.ql-editor {
						height: 100%;
						outline: none;
					}
					.ql-editor.ql-blank::before {
						color: #999;
						font-style: italic;
					}
				`}
			</style>
			<div
				ref={editorRef}
				style={{
					flex: 1,
					minHeight: "300px",
					border: "1px solid #ccc",
					borderRadius: "4px",
					padding: "8px",
					cursor: "text",
				}}
			/>
		</div>
	);
};
