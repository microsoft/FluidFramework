/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type PropTreeNode, withMemoizedTreeObservations } from "@fluidframework/react/alpha";
import Quill from "quill";
import * as React from "react";

import type { TextAsTree } from "./schema.js";

/**
 * Props for the MainView component.
 */
export interface MainViewProps {
	root: PropTreeNode<TextAsTree.Tree>;
}

export const MainView: React.FC<MainViewProps> = ({ root }) => {
	return <TextEditorView root={root} />;
};

/**
 * The text editor view component with Quill integration.
 * Uses TextAsTree for collaborative plain text storage.
 *
 * @remarks
 * This uses withMemoizedTreeObservations to automatically re-render
 * when the tree changes.
 */
const TextEditorView = withMemoizedTreeObservations(({ root }: { root: TextAsTree.Tree }) => {
	// DOM element where Quill will mount its editor
	const editorRef = React.useRef<HTMLDivElement>(null);
	// Quill instance, persisted across renders to avoid re-initialization
	const quillRef = React.useRef<Quill | null>(null);
	// Guards against update loops between Quill and the tree
	const isUpdatingRef = React.useRef<boolean>(false);

	// Access tree content during render to establish observation.
	// The HOC will automatically re-render when this content changes.
	const currentText = root.fullString();

	// Initialize Quill editor
	React.useEffect(() => {
		if (editorRef.current && !quillRef.current) {
			const quill = new Quill(editorRef.current, {
				placeholder: "Start typing...",
			});

			// Set initial content from tree (add trailing newline to match Quill's convention)
			if (currentText.length > 0) {
				const textWithNewline = currentText.endsWith("\n") ? currentText : `${currentText}\n`;
				quill.setText(textWithNewline);
			}

			// Listen to local Quill changes
			quill.on("text-change", (_delta, _oldDelta, source) => {
				if (source === "user" && !isUpdatingRef.current) {
					isUpdatingRef.current = true;

					// Get plain text from Quill and preserve trailing newline
					const text = quill.getText();

					// TODO: Once TextAsTree supports character attributes, use quill.getContents()
					// to get the Delta with formatting info (bold, italic, color, etc.) and store
					// attributes alongside each character.

					// Clear existing content and insert new text
					const length = [...root.characters()].length;
					if (length > 0) {
						root.removeRange(0, length);
					}
					if (text.length > 0) {
						root.insertAt(0, text);
					}

					isUpdatingRef.current = false;
				}
			});

			quillRef.current = quill;
		}
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
		const treeTextWithNewline = currentText.endsWith("\n") ? currentText : `${currentText}\n`;

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
});
