/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type PropTreeNode, unwrapPropTreeNode } from "@fluidframework/react/alpha";
import { Tree } from "@fluidframework/tree";
import Quill from "quill";
import * as React from "react";

import { FormattedTextAsTree } from "./formattedSchema.js";

/**
 * Represents a single operation in a Quill Delta.
 * Deltas describe changes to document content as a sequence of operations.
 */
interface QuillDeltaOp {
	// Text or embed object to insert at current position
	insert?: string | Record<string, unknown>;
	// Number of characters to delete at current position
	delete?: number;
	// Number of characters to keep/skip, optionally applying attributes
	retain?: number;
	// Formatting attributes (bold, italic, size, etc.) for insert/retain ops
	attributes?: Record<string, unknown>;
}

// Represents a Quill Delta
interface QuillDelta {
	// Sequence of operations that make up this delta
	ops?: QuillDeltaOp[];
}

// Props for the FormattedMainView component.
export interface FormattedMainViewProps {
	root: PropTreeNode<FormattedTextAsTree.Tree>;
}

export const FormattedMainView: React.FC<FormattedMainViewProps> = ({ root }) => {
	return <FormattedTextEditorView root={root} />;
};

// Quill size names mapped to pixel values for tree storage
const SIZE_MAP: Record<string, number> = { small: 10, large: 18, huge: 24 };
// Reverse mapping: pixel values back to Quill size names for display
const SIZE_REVERSE: Record<number, string> = { 10: "small", 18: "large", 24: "huge" };
// Default formatting values when no explicit format is specified
const DEFAULT_SIZE = 12;
const DEFAULT_FONT = "Arial";

/**
 * Parse a size value from Quill into a numeric pixel value.
 * Handles Quill's named sizes (small, large, huge), numeric values, and pixel strings.
 */
function parseSize(size: unknown): number {
	if (typeof size === "number") return size;
	if (typeof size === "string") {
		// Try named size first, then parse as number, fallback to default
		return SIZE_MAP[size] ?? (Number.parseInt(size, 10) || DEFAULT_SIZE);
	}
	return DEFAULT_SIZE;
}

/**
 * Convert Quill attributes to a complete CharacterFormat object.
 * Used when inserting new characters - all format properties must have values.
 * Missing attributes default to false/default values.
 */
function quillAttrsToFormat(attrs?: Record<string, unknown>): {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	size: number;
	font: string;
} {
	return {
		bold: attrs?.bold === true,
		italic: attrs?.italic === true,
		underline: attrs?.underline === true,
		size: parseSize(attrs?.size),
		font: typeof attrs?.font === "string" ? attrs.font : DEFAULT_FONT,
	};
}

/**
 * Convert Quill attributes to a partial CharacterFormat object.
 * Used when applying formatting to existing text via retain operations.
 * Only includes properties that were explicitly set in the Quill attributes,
 * allowing selective format updates without overwriting unrelated properties.
 */
function quillAttrsToPartial(
	attrs?: Record<string, unknown>,
): Partial<FormattedTextAsTree.CharacterFormat> {
	if (!attrs) return {};
	const format: Partial<FormattedTextAsTree.CharacterFormat> = {};
	// Only include attributes that are explicitly present in the Quill delta
	if ("bold" in attrs) format.bold = attrs.bold === true;
	if ("italic" in attrs) format.italic = attrs.italic === true;
	if ("underline" in attrs) format.underline = attrs.underline === true;
	if ("size" in attrs) format.size = parseSize(attrs.size);
	if ("font" in attrs)
		format.font = typeof attrs.font === "string" ? attrs.font : DEFAULT_FONT;
	return format;
}

/**
 * Convert a CharacterFormat from the tree to Quill attributes.
 * Used when building Quill deltas from tree content to sync external changes.
 * Only includes non-default values to keep deltas minimal.
 */
function formatToQuillAttrs(
	format: FormattedTextAsTree.CharacterFormat,
): Record<string, unknown> {
	const attrs: Record<string, unknown> = {};
	// Only include non-default formatting to keep Quill deltas minimal
	if (format.bold) attrs.bold = true;
	if (format.italic) attrs.italic = true;
	if (format.underline) attrs.underline = true;
	if (format.size !== DEFAULT_SIZE) {
		// Convert pixel value back to Quill size name if possible
		attrs.size = SIZE_REVERSE[format.size] ?? `${format.size}px`;
	}
	if (format.font !== DEFAULT_FONT) attrs.font = format.font;
	return attrs;
}

/**
 * Build a Quill Delta representing the full tree content.
 * Iterates through formatted characters and groups consecutive characters
 * with identical formatting into single insert operations for efficiency.
 *
 * @remarks
 * This is used to sync Quill's display when the tree changes externally
 * (e.g., from a remote collaborator's edit).
 */
function buildDeltaFromTree(root: FormattedTextAsTree.Tree): QuillDelta {
	const ops: QuillDeltaOp[] = [];
	// Accumulator for current run of identically-formatted text
	let text = "";
	let attrs: Record<string, unknown> = {};
	// JSON key for current attributes, used for equality comparison
	let key = "";

	// Helper to push accumulated text as an insert operation
	const pushRun = (): void => {
		if (!text) return;
		const op: QuillDeltaOp = { insert: text };
		if (Object.keys(attrs).length > 0) op.attributes = attrs;
		ops.push(op);
	};

	// Iterate through each formatted character in the tree
	for (const atom of root.charactersWithFormatting()) {
		const a = formatToQuillAttrs(atom.format);
		const k = JSON.stringify(a);
		if (k === key) {
			// Same formatting as previous character - extend current run
			text += atom.content.content;
		} else {
			// Different formatting - push current run and start new one
			pushRun();
			text = atom.content.content;
			attrs = a;
			key = k;
		}
	}
	// Push any remaining accumulated text
	pushRun();

	// Quill expects documents to end with a newline
	// eslint-disable-next-line unicorn/prefer-at -- .at() not available in target
	const last = ops[ops.length - 1];
	if (typeof last?.insert !== "string" || !last.insert.endsWith("\n")) {
		ops.push({ insert: "\n" });
	}
	return { ops };
}

/**
 * The formatted text editor view component with Quill integration.
 * Uses FormattedTextAsTree for collaborative rich text storage with formatting.
 *
 * @remarks
 * This component uses event-based synchronization via Tree.on("treeChanged")
 * to efficiently handle external changes without expensive render-time operations.
 * Unlike the plain text version, this component uses Quill's delta operations
 * to make targeted edits (insert at index, delete range, format range) rather
 * than replacing all content on each change.
 */
const FormattedTextEditorView: React.FC<{
	root: PropTreeNode<FormattedTextAsTree.Tree>;
}> = ({ root: propRoot }) => {
	// Unwrap the PropTreeNode to get the actual tree node
	const root = unwrapPropTreeNode(propRoot);
	// DOM element where Quill will mount its editor
	const editorRef = React.useRef<HTMLDivElement>(null);
	// Quill instance, persisted across renders to avoid re-initialization
	const quillRef = React.useRef<Quill | null>(null);
	// Guards against update loops between Quill and the tree
	const isUpdating = React.useRef(false);

	// Initialize Quill editor with formatting toolbar using Quill provided CSS
	React.useEffect(() => {
		if (!editorRef.current || quillRef.current) return;
		const quill = new Quill(editorRef.current, {
			theme: "snow",
			placeholder: "Start typing with formatting...",
			modules: {
				toolbar: {
					container: [
						["undo", "redo"],
						["bold", "italic", "underline"],
						[{ size: ["small", false, "large", "huge"] }],
						[{ font: [] }],
						["clean"],
					],
					handlers: {
						undo(this: { quill: Quill }) {
							this.quill.history.undo();
						},
						redo(this: { quill: Quill }) {
							this.quill.history.redo();
						},
					},
				},
			},
		});

		// Set initial content from tree
		quill.setContents(buildDeltaFromTree(root));

		// Listen to local Quill changes and apply them to the tree.
		// We process delta operations to make targeted edits, preserving collaboration integrity.
		quill.on("text-change", (delta, _oldDelta, source) => {
			if (source !== "user" || isUpdating.current) return;
			isUpdating.current = true;

			// Process each delta operation sequentially, tracking current position
			let index = 0;
			for (const op of (delta as QuillDelta).ops ?? []) {
				if (op.retain !== undefined) {
					// Retain: keep characters, optionally apply formatting changes
					if (op.attributes) {
						root.formatRange(index, op.retain, quillAttrsToPartial(op.attributes));
					}
					index += op.retain;
				} else if (op.delete !== undefined) {
					// Delete: remove characters at current position
					root.removeRange(index, index + op.delete);
					// Don't advance index - next op starts at same position
				} else if (typeof op.insert === "string") {
					// Insert: add new text with formatting at current position
					root.defaultFormat = new FormattedTextAsTree.CharacterFormat(
						quillAttrsToFormat(op.attributes),
					);
					root.insertAt(index, op.insert);
					// Advance index by number of characters inserted (not UTF-16 length)
					index += [...op.insert].length;
				}
			}

			isUpdating.current = false;
		});

		quillRef.current = quill;
		// In React strict mode, effects run twice. The `!quillRef.current` check above
		// makes the second call a no-op, preventing double-initialization of Quill.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sync Quill when tree changes externally (e.g., from remote collaborators).
	// Uses event subscription instead of render-time observation for efficiency.
	React.useEffect(() => {
		return Tree.on(root, "treeChanged", () => {
			// Skip if we caused the tree change ourselves via the text-change handler
			if (!quillRef.current || isUpdating.current) return;

			const treeDelta = buildDeltaFromTree(root);
			const quillDelta = quillRef.current.getContents() as QuillDelta;

			// Only update if content actually differs (avoids cursor jump on local edits)
			if (JSON.stringify(quillDelta.ops) !== JSON.stringify(treeDelta.ops)) {
				isUpdating.current = true;

				// Preserve cursor position across content update
				const sel = quillRef.current.getSelection();
				quillRef.current.setContents(treeDelta);
				if (sel) {
					// Clamp cursor to valid range in case content is shorter
					const pos = Math.min(sel.index, quillRef.current.getLength() - 1);
					quillRef.current.setSelection(pos, 0);
				}

				isUpdating.current = false;
			}
		});
	}, [root]);

	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
			<link href="https://cdn.jsdelivr.net/npm/quill@2/dist/quill.snow.css" rel="stylesheet" />
			<style>{`
				.ql-container { height: 100%; font-size: 14px; }
				.ql-editor { height: 100%; outline: none; }
				.ql-editor.ql-blank::before { color: #999; font-style: italic; }
				.ql-toolbar { border-radius: 4px 4px 0 0; background: #f8f9fa; }
				.ql-container.ql-snow { border-radius: 0 0 4px 4px; }
				.ql-undo, .ql-redo { width: 28px !important; }
				.ql-undo::after { content: "↶"; font-size: 18px; }
				.ql-redo::after { content: "↷"; font-size: 18px; }
			`}</style>
			<h2 style={{ margin: "10px 0" }}>Collaborative Formatted Text Editor</h2>
			<div
				ref={editorRef}
				style={{
					flex: 1,
					minHeight: "300px",
					border: "1px solid #ccc",
					borderRadius: "4px",
				}}
			/>
		</div>
	);
};
