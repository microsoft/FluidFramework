/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type PropTreeNode, unwrapPropTreeNode } from "@fluidframework/react/alpha";
// eslint-disable-next-line import-x/no-internal-modules
import { treeDataObjectInternal } from "@fluidframework/react/internal";
import { Tree, TreeViewConfiguration, type TreeViewEvents } from "@fluidframework/tree";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree } from "@fluidframework/tree/internal";
// eslint-disable-next-line import-x/no-internal-modules
export { FormattedTextAsTree } from "@fluidframework/tree/internal";
import type { Listenable } from "fluid-framework";
import Quill from "quill";
import Delta from "quill-delta";
import * as React from "react";

import { createUndoRedoStacks, type UndoRedo } from "./undoRedo.js";

export const FormattedTextEditorFactory = treeDataObjectInternal(
	new TreeViewConfiguration({ schema: FormattedTextAsTree.Tree }),
	() => FormattedTextAsTree.Tree.fromString(""),
).factory;

/**
 * Represents a single operation in a Quill Delta.
 * Deltas describe changes to document content as a sequence of operations.
 */
interface QuillDeltaOp {
	/** Text or embed object to insert at current position. */
	insert?: string | Record<string, unknown>;
	/** Number of characters to delete at current position. */
	delete?: number;
	/** Number of characters to keep/skip, optionally applying attributes. */
	retain?: number;
	/** Formatting attributes (bold, italic, size, etc.) for insert/retain ops. */
	attributes?: Record<string, unknown>;
}

/** Represents a Quill Delta. */
interface QuillDelta {
	/** Sequence of operations that make up this delta. */
	ops?: QuillDeltaOp[];
}

/** Props for the FormattedMainView component. */
export interface FormattedMainViewProps {
	root: PropTreeNode<FormattedTextAsTree.Tree>;
	treeViewEvents: Listenable<TreeViewEvents>;
}

/** Ref handle exposing undo/redo methods for the formatted editor. */
export interface FormattedEditorHandle {
	undo: () => void;
	redo: () => void;
}

export const FormattedMainView = React.forwardRef<
	FormattedEditorHandle,
	FormattedMainViewProps
>(({ root, treeViewEvents }, ref) => {
	return <FormattedTextEditorView root={root} treeViewEvents={treeViewEvents} ref={ref} />;
});
FormattedMainView.displayName = "FormattedMainView";

/** Quill size names mapped to pixel values for tree storage. */
const sizeMap = { small: 10, large: 18, huge: 24 } as const;
/** Reverse mapping: pixel values back to Quill size names for display. */
const sizeReverse = { 10: "small", 18: "large", 24: "huge" } as const;
/** Default formatting values when no explicit format is specified. */
const defaultSize = 12;
/** Default font when no explicit font is specified. */
const defaultFont = "Arial";

/**
 * Parse a size value from Quill into a numeric pixel value.
 * Handles Quill's named sizes (small, large, huge), numeric values, and pixel strings.
 */
function parseSize(size: unknown): number {
	if (typeof size === "number") return size;
	if (size === "small" || size === "large" || size === "huge") {
		return sizeMap[size];
	}
	if (typeof size === "string") {
		const parsed = Number.parseInt(size, 10);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}
	return defaultSize;
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
		font: typeof attrs?.font === "string" ? attrs.font : defaultFont,
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
	if ("font" in attrs) format.font = typeof attrs.font === "string" ? attrs.font : defaultFont;
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
	if (format.size !== defaultSize) {
		// Convert pixel value back to Quill size name if possible
		attrs.size =
			format.size in sizeReverse
				? sizeReverse[format.size as keyof typeof sizeReverse]
				: `${format.size}px`;
	}
	if (format.font !== defaultFont) attrs.font = format.font;
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
const FormattedTextEditorView = React.forwardRef<
	FormattedEditorHandle,
	{
		root: PropTreeNode<FormattedTextAsTree.Tree>;
		treeViewEvents: Listenable<TreeViewEvents>;
	}
>(({ root: propRoot, treeViewEvents }, ref) => {
	// Unwrap the PropTreeNode to get the actual tree node
	const root = unwrapPropTreeNode(propRoot);
	// DOM element where Quill will mount its editor
	const editorRef = React.useRef<HTMLDivElement>(null);
	// Quill instance, persisted across renders to avoid re-initialization
	const quillRef = React.useRef<Quill | null>(null);
	// Guards against update loops between Quill and the tree
	const isUpdating = React.useRef(false);
	// Undo/redo stack manager
	const undoRedoRef = React.useRef<UndoRedo | undefined>(undefined);

	// Expose undo/redo methods via ref
	React.useImperativeHandle(ref, () => ({
		undo: () => undoRedoRef.current?.undo(),
		redo: () => undoRedoRef.current?.redo(),
	}));

	// Initialize undo/redo stacks (guard against StrictMode double-mount)
	React.useEffect(() => {
		if (undoRedoRef.current) return;
		undoRedoRef.current = createUndoRedoStacks(treeViewEvents);
		return () => {
			undoRedoRef.current?.dispose();
			undoRedoRef.current = undefined;
		};
	}, [treeViewEvents]);

	// Initialize Quill editor with formatting toolbar using Quill provided CSS
	React.useEffect(() => {
		if (!editorRef.current || quillRef.current) return;
		const quill = new Quill(editorRef.current, {
			theme: "snow",
			placeholder: "Start typing with formatting...",
			modules: {
				history: false, // Disable Quill's built-in undo/redo
				toolbar: {
					container: [
						["undo", "redo"],
						["bold", "italic", "underline"],
						[{ size: ["small", false, "large", "huge"] }],
						[{ font: [] }],
						["clean"],
					],
					handlers: {
						undo() {
							undoRedoRef.current?.undo();
						},
						redo() {
							undoRedoRef.current?.redo();
						},
					},
				},
			},
		});

		// Set initial content from tree
		quill.setContents(buildDeltaFromTree(root));

		// Listen to local Quill changes and apply them to the tree.
		// We process delta operations to make targeted edits, preserving collaboration integrity.
		// Note: Quill uses UTF-16 code units for positions, but the tree uses Unicode codepoints.
		// We must convert between them to handle emoji and other non-BMP characters correctly.
		quill.on("text-change", (delta, _oldDelta, source) => {
			if (source !== "user" || isUpdating.current) return;
			isUpdating.current = true;

			// Wrap all tree mutations in a transaction so they undo/redo as one atomic unit
			Tree.runTransaction(root, () => {
				// Helper to count Unicode codepoints in a string
				const codepointCount = (s: string): number => [...s].length;

				// Get current content for UTF-16 to codepoint position mapping
				// We update this as we process operations to keep positions accurate
				let content = root.fullString();
				let utf16Pos = 0; // Position in UTF-16 code units (Quill's view)
				let cpPos = 0; // Position in codepoints (tree's view)

				for (const op of (delta as QuillDelta).ops ?? []) {
					if (op.retain !== undefined) {
						// Convert UTF-16 retain count to codepoint count
						const retainedStr = content.slice(utf16Pos, utf16Pos + op.retain);
						const cpCount = codepointCount(retainedStr);

						if (op.attributes) {
							root.formatRange(cpPos, cpCount, quillAttrsToPartial(op.attributes));
						}
						utf16Pos += op.retain;
						cpPos += cpCount;
					} else if (op.delete !== undefined) {
						// Convert UTF-16 delete count to codepoint count
						const deletedStr = content.slice(utf16Pos, utf16Pos + op.delete);
						const cpCount = codepointCount(deletedStr);

						root.removeRange(cpPos, cpPos + cpCount);
						// Update content to reflect deletion for future position calculations
						content = content.slice(0, utf16Pos) + content.slice(utf16Pos + op.delete);
						// Don't advance positions - next op starts at same position
					} else if (typeof op.insert === "string") {
						// Insert: add new text with formatting at current position
						root.defaultFormat = new FormattedTextAsTree.CharacterFormat(
							quillAttrsToFormat(op.attributes),
						);
						root.insertAt(cpPos, op.insert);
						// Update content to reflect insertion
						content = content.slice(0, utf16Pos) + op.insert + content.slice(utf16Pos);
						// Advance by inserted content length
						utf16Pos += op.insert.length;
						cpPos += codepointCount(op.insert);
					}
				}
			});

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

			// Compute diff between current Quill state and tree state
			const diff = new Delta(quillDelta.ops).diff(new Delta(treeDelta.ops)) as QuillDelta;

			// Only update if there are actual differences
			if (diff.ops && diff.ops.length > 0) {
				isUpdating.current = true;

				// Apply only the diff for surgical updates (better cursor preservation)
				quillRef.current.updateContents(diff);

				isUpdating.current = false;
			}
		});
	}, [root]);

	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
});
FormattedTextEditorView.displayName = "FormattedTextEditorView";
