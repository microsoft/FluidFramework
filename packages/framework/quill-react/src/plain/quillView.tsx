/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	withMemoizedTreeObservations,
	syncTextToTree,
	type PropTreeNode,
} from "@fluidframework/react/internal";
import type { TextAsTree } from "@fluidframework/tree/internal";
import Quill from "quill";
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
	const editorRef = useRef<HTMLDivElement>(null);
	// Quill instance, persisted across renders to avoid re-initialization
	const quillRef = useRef<Quill | undefined>(undefined);
	// Guards against update loops between Quill and the tree
	const isUpdatingRef = useRef<boolean>(false);

	// Access tree content during render to establish observation.
	// The HOC will automatically re-render when this content changes.
	const currentText = root.fullString();

	// Initialize Quill editor
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

		// Listen to local Quill changes
		const handleTextChange = (_delta: unknown, _oldDelta: unknown, source: string): void => {
			if (source === "user" && !isUpdatingRef.current) {
				isUpdatingRef.current = true;

				// Get plain text from Quill and preserve trailing newline
				const newText = quill.getText();
				// TODO: Consider using delta from Quill to compute a more minimal update,
				// and maybe add a debugAssert that the delta actually gets the strings synchronized.
				syncTextToTree(root, newText);

				isUpdatingRef.current = false;
			}
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
});
