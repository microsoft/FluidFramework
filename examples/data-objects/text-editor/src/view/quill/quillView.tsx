/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type PropTreeNode, withMemoizedTreeObservations } from "@fluidframework/react/alpha";
import Quill from "quill";
// eslint-disable-next-line import-x/no-internal-modules, import-x/no-unassigned-import
import "quill/dist/quill.snow.css";
import * as React from "react";

import type { TextAsTree } from "../../schema.js";

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
 * @remarks This uses withMemoizedTreeObservations to automatically re-render
 * when the tree changes
 */
const TextEditorView = withMemoizedTreeObservations(({ root }: { root: TextAsTree.Tree }) => {
	const editorRef = React.useRef<HTMLDivElement>(null);
	const quillRef = React.useRef<Quill | null>(null);
	const isUpdatingRef = React.useRef<boolean>(false);

	// Access tree content during render to establish observation.
	// The HOC will automatically re-render when this content changes.
	const currentText = root.fullString();

	// Initialize Quill editor
	React.useEffect(() => {
		if (editorRef.current && !quillRef.current) {
			const quill = new Quill(editorRef.current, {
				theme: "snow",
				placeholder: "Start typing...",
				modules: {
					// disable toolbar. No formatting supported yet
					toolbar: false,
				},
			});

			// Set initial content from tree
			if (currentText.length > 0) {
				quill.setText(currentText);
			}

			// Listen to local Quill changes
			quill.on("text-change", (_delta, _oldDelta, source) => {
				if (source === "user" && !isUpdatingRef.current) {
					isUpdatingRef.current = true;

					// Get plain text from Quill
					const text = quill.getText();
					const cleanText = text.endsWith("\n") ? text.slice(0, -1) : text;

					// TODO: Once TextAsTree supports character attributes, use quill.getContents()
					// to get the Delta with formatting info (bold, italic, color, etc.) and store
					// attributes alongside each character.

					// Clear existing content and insert new text
					const length = [...root.characters()].length;
					if (length > 0) {
						root.removeRange(0, length);
					}
					if (cleanText.length > 0) {
						root.insertAt(0, cleanText);
					}

					isUpdatingRef.current = false;
				}
			});

			quillRef.current = quill;
		}
		// Only run on mount - quill initialization should happen once
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Update Quill when tree changes from remote (detected via re-render from HOC)
	React.useEffect(() => {
		if (quillRef.current && !isUpdatingRef.current) {
			const quillText = quillRef.current.getText();
			const cleanQuillText = quillText.endsWith("\n") ? quillText.slice(0, -1) : quillText;

			// Only update if content actually differs (avoids cursor jump on local edits)
			if (cleanQuillText !== currentText) {
				isUpdatingRef.current = true;

				const selection = quillRef.current.getSelection();
				quillRef.current.setText(currentText);
				if (selection) {
					const length = quillRef.current.getLength();
					const newPosition = Math.min(selection.index, length - 1);
					quillRef.current.setSelection(newPosition, 0);
				}

				isUpdatingRef.current = false;
			}
		}
	}, [currentText]);

	return (
		<div
			className="text-editor-container"
			style={{ height: "100%", display: "flex", flexDirection: "column" }}
		>
			<h2 style={{ margin: "10px 0" }}>Collaborative Text Editor</h2>
			<div ref={editorRef} style={{ flex: 1, minHeight: "300px" }} />
		</div>
	);
});
