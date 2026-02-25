/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { withMemoizedTreeObservations } from "@fluidframework/react/alpha";
import * as React from "react";

import { syncTextToTree } from "./plainUtils.js";
import type { MainViewProps } from "./quillView.js";
import type { TextAsTree } from "./schema.js";

export const MainView: React.FC<MainViewProps> = ({ root }) => {
	return <PlainTextEditorView root={root} />;
};

/**
 * A plain text editor view component using a native HTML textarea.
 * Uses TextAsTree for collaborative plain text storage.
 *
 * @remarks
 * This uses withMemoizedTreeObservations to automatically re-render
 * when the tree changes.
 */
const PlainTextEditorView = withMemoizedTreeObservations(
	({ root }: { root: TextAsTree.Tree }) => {
		// Reference to the textarea element
		const textareaRef = React.useRef<HTMLTextAreaElement>(null);
		// Guards against update loops between textarea and the tree
		const isUpdatingRef = React.useRef<boolean>(false);

		// Access tree content during render to establish observation.
		// The HOC will automatically re-render when this content changes.
		const currentText = root.fullString();

		// Handle textarea changes - sync textarea → tree
		const handleChange = React.useCallback(
			(event: React.ChangeEvent<HTMLTextAreaElement>) => {
				if (isUpdatingRef.current) {
					return;
				}

				isUpdatingRef.current = true;

				const newText = event.target.value;
				syncTextToTree(root, newText);

				isUpdatingRef.current = false;
			},
			[root],
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
