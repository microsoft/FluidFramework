/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { Tree, TreeAlpha, FormattedTextAsTree } from "@fluidframework/tree/internal";
export { FormattedTextAsTree } from "@fluidframework/tree/internal";
import Quill, { type EmitterSource } from "quill";
import DeltaPackage from "quill-delta";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useReducer,
	useRef,
	useState,
} from "react";
import * as ReactDOM from "react-dom";

import { type PropTreeNode, unwrapPropTreeNode } from "../../propNode.js";
import type { UndoRedo } from "../../undoRedo.js";

// Workaround for quill-delta's export style not working well with node16 module resolution.
type Delta = DeltaPackage.default;
type QuillDeltaOp = DeltaPackage.Op;
const Delta = DeltaPackage.default;

/**
 * Props for the FormattedMainView component.
 * @input @internal
 */
export interface FormattedMainViewProps {
	readonly root: PropTreeNode<FormattedTextAsTree.Tree>;
	/** Optional undo/redo stack for the editor. */
	readonly undoRedo?: UndoRedo;
}

/**
 * Ref handle exposing undo/redo methods for the formatted editor.
 * @input @internal
 */
export type FormattedEditorHandle = Pick<UndoRedo, "undo" | "redo">;

/**
 * A React component for formatted text editing.
 * @remarks
 * Uses {@link @fluidframework/tree#FormattedTextAsTree.Tree} for the data-model and Quill for the rich text editor UI.
 * @internal
 */
export const FormattedMainView = forwardRef<FormattedEditorHandle, FormattedMainViewProps>(
	({ root, undoRedo }, ref) => {
		return <FormattedTextEditorView root={root} undoRedo={undoRedo} ref={ref} />;
	},
);
FormattedMainView.displayName = "FormattedMainView";

/** Quill size names mapped to pixel values for tree storage. */
const sizeMap = { small: 10, large: 18, huge: 24 } as const;
/** Reverse mapping: pixel values back to Quill size names for display. */
const sizeReverse = { 10: "small", 18: "large", 24: "huge" } as const;
/** Set of recognized font families for Quill. */
const fontSet = new Set<string>(["monospace", "serif", "sans-serif", "Arial"]);
/** Default formatting values when no explicit format is specified. */
const defaultSize = 12;
/** Default font when no explicit font is specified. */
const defaultFont = "Arial";
/** default heading for when an unsupported header is supplied */
const defaultHeading = "h5";
/** The string literal values accepted by LineTag. */
type LineTagValue = Parameters<typeof FormattedTextAsTree.LineTag>[0];
/** Quill header numbers → LineTag values. */
const headerToLineTag = {
	1: "h1",
	2: "h2",
	3: "h3",
	4: "h4",
	5: "h5",
} as const satisfies Readonly<Record<number, LineTagValue>>;
/** LineTag values → Quill attributes. Used by buildDeltaFromTree (tree → Quill). */
const lineTagToQuillAttributes = {
	h1: { header: 1 },
	h2: { header: 2 },
	h3: { header: 3 },
	h4: { header: 4 },
	h5: { header: 5 },
	li: { list: "bullet" },
} as const satisfies Readonly<Record<LineTagValue, Record<string, unknown>>>;
/**
 * Parse CSS font-size from a pasted HTML element's inline style.
 * Returns a Quill size name if the pixel value matches a supported size, undefined otherwise.
 * 12px is the default size and returns undefined (no Quill attribute needed).
 */
export function parseCssFontSize(node: HTMLElement): string | undefined {
	const style = node.style.fontSize;
	if (!style) return undefined;

	// check if pixel value is in <size>px format
	if (style.endsWith("px")) {
		// Parse pixel value (e.g., "18px" -> 18)
		const parsed = Number.parseFloat(style);
		if (Number.isNaN(parsed)) return undefined;

		// Round to nearest integer and look up Quill size name
		const rounded = Math.round(parsed);
		if (rounded in sizeReverse) {
			return sizeReverse[rounded as keyof typeof sizeReverse];
		}
	}
	return undefined;
}

/**
 * Parse CSS font-family from a pasted HTML element's inline style.
 * Tries fonts in priority order (first to last per CSS spec) and returns
 * the first recognized Quill font value.
 */
export function parseCssFontFamily(node: HTMLElement): string | undefined {
	const style = node.style.fontFamily;
	if (style === "") return undefined;

	// Splitting on "," does not handle commas inside quoted font names, and escape
	// sequences within font names are not supported. This is fine since none of the
	// font names we match against contain commas or escapes.
	const fonts = style.split(",");
	for (const raw of fonts) {
		// Trim whitespace and leading and trailing quotes
		const font = raw.trim().replace(/^["']/, "").replace(/["']$/, "");
		// check if font is in our supported font set
		if (fontSet.has(font)) {
			return font;
		}
	}
	// No recognized font family found; fall back to default (Arial)
	return undefined;
}

/**
 * Clipboard matcher that preserves recognized font-size and font-family
 * from pasted HTML elements. Applies each format independently via
 * compose/retain so new attributes can be added without risk of an
 * early return skipping them.
 * @see https://quilljs.com/docs/modules/clipboard#addmatcher
 */
export function clipboardFormatMatcher(node: Node, delta: Delta): Delta {
	if (!(node instanceof HTMLElement)) return delta;

	const size = parseCssFontSize(node);
	const font = parseCssFontFamily(node);

	let result = delta;
	if (size !== undefined) {
		result = result.compose(new Delta().retain(result.length(), { size }));
	}
	if (font !== undefined) {
		result = result.compose(new Delta().retain(result.length(), { font }));
	}
	return result;
}

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

/** Extract a LineTag from Quill attributes, or undefined if none present. Quill only supports one LineTag at a time. */
export function parseLineTag(
	attributes?: Record<string, unknown>,
): FormattedTextAsTree.LineTag | undefined {
	if (!attributes) return undefined;
	// Quill should never send both header and list attributes simultaneously.
	assert(
		!(typeof attributes.header === "number" && typeof attributes.list === "string"),
		"expected at most one line tag (header or list), but received both",
	);
	if (typeof attributes.header === "number") {
		const tag: LineTagValue =
			headerToLineTag[attributes.header as keyof typeof headerToLineTag] ?? defaultHeading;
		return FormattedTextAsTree.LineTag(tag);
	}
	if (attributes.list === "bullet") {
		return FormattedTextAsTree.LineTag("li");
	}
	return undefined;
}

/** Create a StringAtom containing a StringLineAtom with the given line tag. */
function createLineAtom(lineTag: FormattedTextAsTree.LineTag): FormattedTextAsTree.StringAtom {
	return new FormattedTextAsTree.StringAtom({
		content: new FormattedTextAsTree.StringLineAtom({
			tag: lineTag,
		}),
		format: new FormattedTextAsTree.CharacterFormat(quillAttributesToFormat()),
	});
}

/**
 * Convert Quill attributes to a complete CharacterFormat object.
 * Used when inserting new characters - all format properties must have values.
 * Missing attributes default to false/default values.
 */
function quillAttributesToFormat(attributes?: Record<string, unknown>): {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	size: number;
	font: string;
} {
	return {
		bold: attributes?.bold === true,
		italic: attributes?.italic === true,
		underline: attributes?.underline === true,
		size: parseSize(attributes?.size),
		font: typeof attributes?.font === "string" ? attributes.font : defaultFont,
	};
}

/**
 * Convert Quill attributes to a partial CharacterFormat object.
 * Used when applying formatting to existing text via retain operations.
 * Only includes properties that were explicitly set in the Quill attributes,
 * allowing selective format updates without overwriting unrelated properties.
 */
function quillAttributesToPartial(
	attributes?: Record<string, unknown>,
): Partial<FormattedTextAsTree.CharacterFormat> {
	if (!attributes) return {};
	const format: Partial<FormattedTextAsTree.CharacterFormat> = {};
	// Only include attributes that are explicitly present in the Quill delta
	if ("bold" in attributes) format.bold = attributes.bold === true;
	if ("italic" in attributes) format.italic = attributes.italic === true;
	if ("underline" in attributes) format.underline = attributes.underline === true;
	if ("size" in attributes) format.size = parseSize(attributes.size);
	if ("font" in attributes)
		format.font = typeof attributes.font === "string" ? attributes.font : defaultFont;
	return format;
}

/**
 * Convert a CharacterFormat from the tree to Quill attributes.
 * Used when building Quill deltas from tree content to sync external changes.
 * Only includes non-default values to keep deltas minimal.
 */
function formatToQuillAttributes(
	format: FormattedTextAsTree.CharacterFormat,
): Record<string, unknown> {
	const attributes: Record<string, unknown> = {};
	// Only include non-default formatting to keep Quill deltas minimal
	if (format.bold) attributes.bold = true;
	if (format.italic) attributes.italic = true;
	if (format.underline) attributes.underline = true;
	if (format.size !== defaultSize) {
		// Convert pixel value back to Quill size name if possible
		attributes.size =
			format.size in sizeReverse
				? sizeReverse[format.size as keyof typeof sizeReverse]
				: `${format.size}px`;
	}
	if (format.font !== defaultFont) attributes.font = format.font;
	return attributes;
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
export function buildDeltaFromTree(root: FormattedTextAsTree.Tree): QuillDeltaOp[] {
	const ops: QuillDeltaOp[] = [];
	let index = 0;

	while (index < root.characterCount()) {
		const atom = root.charactersWithFormatting()[index];
		if (atom === undefined) {
			break;
		}
		if (atom.content instanceof FormattedTextAsTree.StringLineAtom) {
			// Line atom (header, bullet lists) emit a newline with a line tag attribute
			const currentAttributes = formatToQuillAttributes(atom.format);
			const lineTag = atom.content.tag.value;
			Object.assign(currentAttributes, lineTagToQuillAttributes[lineTag]);

			const op: QuillDeltaOp = { insert: "\n" };
			if (Object.keys(currentAttributes).length > 0) {
				op.attributes = currentAttributes;
			}
			ops.push(op);
			index += 1;
		} else {
			// Regular text atom: use getUniformRun to get length of consecutive characters with same formatting.
			// Then getString to get the substring.
			const runLength = root.getUniformRun(index);
			const text = root.getString(index, index + runLength);
			const attributes = formatToQuillAttributes(atom.format);
			const op: QuillDeltaOp = { insert: text };
			if (Object.keys(attributes).length > 0) {
				op.attributes = attributes;
			}
			ops.push(op);
			index += runLength;
		}
	}
	// Quill expects documents to end with a newline
	// eslint-disable-next-line unicorn/prefer-at -- .at() not available in target
	const last = ops[ops.length - 1];
	if (typeof last?.insert !== "string" || !last.insert.endsWith("\n")) {
		ops.push({ insert: "\n" });
	}
	return ops;
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
const FormattedTextEditorView = forwardRef<
	FormattedEditorHandle,
	{
		root: PropTreeNode<FormattedTextAsTree.Tree>;
		undoRedo?: UndoRedo;
	}
>(({ root: propRoot, undoRedo }, ref) => {
	// Unwrap the PropTreeNode to get the actual tree node
	const root = unwrapPropTreeNode(propRoot);
	// DOM element where Quill will mount its editor
	const editorRef = useRef<HTMLDivElement>(null);
	// Quill instance, persisted across renders to avoid re-initialization
	const quillRef = useRef<Quill | null>(null);
	// Guards against update loops between Quill and the tree
	const isUpdating = useRef(false);
	// Container element for undo/redo button portal
	const [undoRedoContainer, setUndoRedoContainer] = useState<HTMLElement | undefined>(
		undefined,
	);
	// Force re-render when undo/redo state changes
	const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

	// Expose undo/redo methods via ref
	useImperativeHandle(ref, () => ({
		undo: () => undoRedo?.undo(),
		redo: () => undoRedo?.redo(),
	}));

	// Initialize Quill editor with formatting toolbar using Quill provided CSS
	useEffect(() => {
		if (!editorRef.current || quillRef.current) return;
		const quill = new Quill(editorRef.current, {
			theme: "snow",
			placeholder: "Start typing with formatting...",
			modules: {
				history: false, // Disable Quill's built-in undo/redo
				toolbar: [
					["bold", "italic", "underline"],
					[{ size: ["small", false, "large", "huge"] }],
					[{ font: [] }],
					[{ header: [1, 2, 3, 4, 5, false] }],
					[{ list: "bullet" }],
					["clean"],
				],
				clipboard: [Node.ELEMENT_NODE, clipboardFormatMatcher],
			},
		});

		// Set initial content from tree
		quill.setContents(buildDeltaFromTree(root));

		// Listen to local Quill changes and apply them to the tree.
		// We process delta operations to make targeted edits, preserving collaboration integrity.
		// Note: Quill uses UTF-16 code units for positions, but the tree uses Unicode codepoints.
		// We must convert between them to handle emoji and other non-BMP characters correctly.
		//
		// The typing here is very fragile: if no parameter types are given,
		// the inference for this event is strongly typed, but the types are wrong (The wrong "Delta" type is provided).
		// This is likely related to the node16 module resolution issues with quill-delta.
		// If we break that inference by adding types, `any` is inferred for all of them, so incorrect types here would still compile.
		quill.on("text-change", (delta: Delta, _oldDelta: Delta, source: EmitterSource) => {
			if (source !== "user" || isUpdating.current) return;
			isUpdating.current = true;

			// Wrap all tree mutations in a transaction so they undo/redo as one atomic unit.
			// If the node is not part of a branch (e.g. unhydrated), apply edits directly.
			const branch = TreeAlpha.branch(root);
			const applyDelta = (): void => {
				// Helper to count Unicode codepoints in a string
				const codepointCount = (s: string): number => [...s].length;

				// Get current content for UTF-16 to codepoint position mapping
				// We update this as we process operations to keep positions accurate
				let content = root.fullString();
				let utf16Pos = 0; // Position in UTF-16 code units (Quill's view)
				let cpPos = 0; // Position in codepoints (tree's view)

				for (const op of delta.ops) {
					if (op.retain !== undefined) {
						// The docs for retain imply this is always a number, but the type definitions allow a record here.
						// It is unknown why the type definitions allow a record as they have no doc comments.
						// For now this assert seems to be passing, so we just assume its always a number.
						assert(
							typeof op.retain === "number",
							0xcdf /* Expected retain count to be a number */,
						);
						// Convert UTF-16 retain count to codepoint count
						const retainedStr = content.slice(utf16Pos, utf16Pos + op.retain);
						const cpCount = codepointCount(retainedStr);

						if (op.attributes) {
							const lineTag = parseLineTag(op.attributes);
							// Case 1: Applying line formatting (header/list) to an existing newline in the document.
							if (lineTag !== undefined && content[utf16Pos] === "\n") {
								// Swap existing newline atom to StringLineAtom
								root.removeRange(cpPos, cpPos + 1);
								root.insertWithFormattingAt(cpPos, [createLineAtom(lineTag)]);
								// Case 2: Applying line formatting past the end of content. Quill's implicit trailing newline.
							} else if (lineTag !== undefined && utf16Pos >= content.length) {
								// Quill's implicit trailing newline — insert a new line atom
								root.insertWithFormattingAt(cpPos, [createLineAtom(lineTag)]);
								content += "\n";
								// Case 3: clearing line formatting. Deletes StringLineAtom and inserts a plain
								// StringTextAtom("\n") in its place.
							} else if (
								lineTag === undefined &&
								content[utf16Pos] === "\n" &&
								root.charactersWithFormatting()[cpPos]?.content instanceof
									FormattedTextAsTree.StringLineAtom
							) {
								// Quill is clearing line formatting (e.g. { retain: 1, attributes: { header: null } }).
								// StringLineAtom and StringTextAtom are distinct schema types in the tree,
								// so we can't convert between them via formatRange — we must delete the
								// StringLineAtom and insert a plain StringTextAtom("\n") in its place.
								root.removeRange(cpPos, cpPos + 1);
								root.insertAt(cpPos, "\n");
								// Case 4: Normal character formatting (bold, italic, size, etc...)
							} else {
								root.formatRange(
									cpPos,
									cpPos + cpCount,
									quillAttributesToPartial(op.attributes),
								);
							}
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
						const lineTag = parseLineTag(op.attributes);
						if (lineTag !== undefined && op.insert === "\n") {
							root.insertWithFormattingAt(cpPos, [createLineAtom(lineTag)]);
						} else {
							// Insert: add new text with formatting at current position
							root.defaultFormat = new FormattedTextAsTree.CharacterFormat(
								quillAttributesToFormat(op.attributes),
							);
							root.insertAt(cpPos, op.insert);
						}
						// Update content to reflect insertion
						content = content.slice(0, utf16Pos) + op.insert + content.slice(utf16Pos);
						// Advance by inserted content length
						utf16Pos += op.insert.length;
						cpPos += codepointCount(op.insert);
					}
				}
			};
			if (branch === undefined) {
				applyDelta();
			} else {
				branch.runTransaction(applyDelta);
			}

			isUpdating.current = false;
		});

		quillRef.current = quill;

		// Create container for React-controlled undo/redo buttons and prepend to toolbar
		const toolbar = editorRef.current.previousElementSibling as HTMLElement;
		const container = document.createElement("span");
		container.className = "ql-formats";
		toolbar.prepend(container);
		setUndoRedoContainer(container);
		// In React strict mode, effects run twice. The `!quillRef.current` check above
		// makes the second call a no-op, preventing double-initialization of Quill.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sync Quill when tree changes externally (e.g., from remote collaborators).
	// Uses event subscription instead of render-time observation for efficiency.
	useEffect(() => {
		return Tree.on(root, "treeChanged", () => {
			// Skip if we caused the tree change ourselves via the text-change handler
			if (!quillRef.current || isUpdating.current) return;

			// TODO:Performance: Once SharedTree has better ArrayNode change events,
			// use those events to construct a delta, instead of rebuilding a new delta then diffing every edit.
			// After doing the optimization, keep this diffing logic as a way to test for de-sync between the tree and Quill:
			// Use it in tests and possibly occasionally in debug builds.
			const treeDelta = buildDeltaFromTree(root);

			// eslint doesn't seem to be resolving the types correctly here.
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const quillDelta: Delta = quillRef.current.getContents();

			// Compute diff between current Quill state and tree state
			const diff = new Delta(quillDelta).diff(new Delta(treeDelta));

			// Only update if there are actual differences
			if (diff.ops.length > 0) {
				isUpdating.current = true;

				// Apply only the diff for surgical updates (better cursor preservation)
				quillRef.current.updateContents(diff.ops);

				isUpdating.current = false;
			}
		});
	}, [root]);

	// Subscribe to undo/redo state changes to update button disabled state
	useEffect(() => {
		if (!undoRedo) return;
		return undoRedo.onStateChange(() => {
			forceUpdate();
		});
	}, [undoRedo]);

	// Render undo/redo buttons via portal into Quill toolbar
	const undoRedoButtons = undoRedoContainer
		? ReactDOM.createPortal(
				<>
					<button
						type="button"
						className="ql-undo"
						disabled={undoRedo?.canUndo() !== true}
						onClick={() => undoRedo?.undo()}
					/>
					<button
						type="button"
						className="ql-redo"
						disabled={undoRedo?.canRedo() !== true}
						onClick={() => undoRedo?.redo()}
					/>
				</>,
				undoRedoContainer,
			)
		: undefined;

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
				.ql-undo:disabled, .ql-redo:disabled { opacity: 0.3; cursor: not-allowed; }
				/* custom css altering Quill's default bullet point alignment */
				/* vertically center bullets in list items, since Quill's bullet has no inherent height */
				li[data-list="bullet"] { display: flex; align-items: center; }
				li[data-list="bullet"] .ql-ui { align-self: center; }
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
			{undoRedoButtons}
		</div>
	);
});
FormattedTextEditorView.displayName = "FormattedTextEditorView";
