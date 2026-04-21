/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	cpCountToUtf16,
	syncTextToTree,
	unwrapPropTreeNode,
	type PropTreeNode,
} from "@fluidframework/react/internal";
import type { TextAsTree } from "@fluidframework/tree/internal";
import Quill from "quill";
import type { Op } from "quill-delta";
import { type FC, useEffect, useRef } from "react";

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
	const quillRef = useRef<Quill | null>(null);
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
		quillRef.current = quill;

		// Set initial content from tree (Quill requires a trailing newline).
		const initialText = root.fullString();
		const textWithNewline = initialText.endsWith("\n") ? initialText : `${initialText}\n`;
		if (textWithNewline.length > 1) {
			quill.setText(textWithNewline);
		}

		// Listen to local Quill changes — sync Quill → tree.
		quill.on("text-change", (_delta, _oldDelta, source) => {
			if (source === "user" && !isUpdatingRef.current) {
				isUpdatingRef.current = true;
				syncTextToTree(root, quill.getText());
				isUpdatingRef.current = false;
			}
		});
	}, []);

	// Subscribe to incremental tree changes — sync tree → Quill.
	// Kept in a separate effect so it re-subscribes correctly after React strict mode cleanup,
	// independent of the Quill initialization guard above.
	useEffect(() => {
		return root.onCharactersChanged((ops) => {
			const quill = quillRef.current;
			if (isUpdatingRef.current || !quill) {
				return;
			}

			isUpdatingRef.current = true;

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
						const utf16Count = cpCountToUtf16(preEditContent, quillPos, op.count);
						quillOps.push({ retain: utf16Count });
						quillPos += utf16Count;
					} else if (op.type === "insert") {
						// op.text is a JS string — Quill handles its UTF-16 encoding automatically.
						quillOps.push({ insert: op.text });
						// quillPos does not advance: inserts are new content not in preEditContent.
					} else {
						const utf16Count = cpCountToUtf16(preEditContent, quillPos, op.count);
						quillOps.push({ delete: utf16Count });
						quillPos += utf16Count;
					}
				}
				quill.updateContents({ ops: quillOps }, "api");
			}

			isUpdatingRef.current = false;
		});
	}, [root]);

	return (
		<div
			className="text-editor-container"
			style={{ height: "100%", display: "flex", flexDirection: "column" }}
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
			<h2 style={{ margin: "10px 0" }}>Collaborative Text Editor</h2>
			<div
				ref={editorRef}
				style={{
					flex: 1,
					minHeight: "300px",
					border: "1px solid #ccc",
					borderRadius: "4px",
					padding: "8px",
				}}
			/>
		</div>
	);
};
