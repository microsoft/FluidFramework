/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextAsTree } from "@fluidframework/tree/internal";
import { type ChangeEvent, type FC, useCallback, useEffect, useRef } from "react";

import { unwrapPropTreeNode, type PropTreeNode } from "../../propNode.js";

import { syncTextToTree } from "./plainUtils.js";

/**
 * A React component for plain text editing.
 * @remarks
 * Uses {@link @fluidframework/tree#TextAsTree.Tree} for the data-model and an HTML textarea for the UI.
 * @internal
 */
export const MainView: FC<{ root: PropTreeNode<TextAsTree.Tree> }> = ({ root }) => {
	return <PlainTextEditorView root={unwrapPropTreeNode(root)} />;
};

/**
 * A plain text editor view component using a native HTML textarea.
 * Uses TextAsTree for collaborative plain text storage.
 *
 * @remarks
 * Subscribes to incremental character-level deltas from the tree via
 * {@link @fluidframework/tree#TextAsTree.Members.onCharactersChanged} to apply
 * remote changes to the textarea without a full re-read of the text.
 */
const PlainTextEditorView: FC<{ root: TextAsTree.Tree }> = ({ root }) => {
	// Reference to the textarea element
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	// Guards against update loops between textarea and the tree
	const isUpdatingRef = useRef<boolean>(false);

	// Subscribe to incremental tree changes and apply them to the textarea.
	useEffect(() => {
		return root.onCharactersChanged((ops) => {
			if (isUpdatingRef.current || !textareaRef.current) {
				return;
			}

			isUpdatingRef.current = true;

			if (ops === undefined) {
				// Delta unavailable — fall back to full re-read.
				textareaRef.current.value = root.fullString();
			} else {
				// Apply ops incrementally to avoid a full O(N) re-read.
				const textarea = textareaRef.current;
				const selectionStart = textarea.selectionStart;
				const selectionEnd = textarea.selectionEnd;

				let newValue = "";
				let readPos = 0;
				const oldValue = textarea.value;
				let newCursorStart = selectionStart;
				let newCursorEnd = selectionEnd;

				for (const op of ops) {
					if (op.type === "retain") {
						newValue += oldValue.slice(readPos, readPos + op.count);
						readPos += op.count;
					} else if (op.type === "insert") {
						// Adjust cursor: shift right if insert is before or at cursor.
						if (readPos <= selectionStart) {
							newCursorStart += op.text.length;
						}
						if (readPos <= selectionEnd) {
							newCursorEnd += op.text.length;
						}
						newValue += op.text;
					} else {
						// remove
						// Adjust each cursor independently by how much of the
						// removed range falls before that cursor position.
						const removeEnd = readPos + op.count;
						if (removeEnd <= selectionStart) {
							newCursorStart -= op.count;
						} else if (readPos < selectionStart) {
							newCursorStart -= selectionStart - readPos;
						}
						if (removeEnd <= selectionEnd) {
							newCursorEnd -= op.count;
						} else if (readPos < selectionEnd) {
							newCursorEnd -= selectionEnd - readPos;
						}
						readPos += op.count;
					}
				}

				// Append any tail not covered by ops (e.g. trailing retained content).
				newValue += oldValue.slice(readPos);

				textarea.value = newValue;
				const clampedStart = Math.min(newCursorStart, newValue.length);
				const clampedEnd = Math.min(newCursorEnd, newValue.length);
				textarea.setSelectionRange(clampedStart, clampedEnd);
			}

			isUpdatingRef.current = false;
		});
	}, [root]);

	// Handle textarea changes - sync textarea → tree
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			if (isUpdatingRef.current) {
				return;
			}

			isUpdatingRef.current = true;

			syncTextToTree(root, event.target.value);

			isUpdatingRef.current = false;
		},
		[root],
	);

	return (
		<div
			className="text-editor-container"
			style={{ height: "100%", display: "flex", flexDirection: "column" }}
		>
			<h2 style={{ margin: "10px 0" }}>Collaborative Text Editor</h2>
			<textarea
				ref={textareaRef}
				defaultValue={root.fullString()}
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
};
