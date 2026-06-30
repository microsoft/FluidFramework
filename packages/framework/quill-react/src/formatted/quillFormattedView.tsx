/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	type PropTreeNode,
	unwrapPropTreeNode,
	type TextEditorProps,
	type UndoRedo,
} from "@fluidframework/react/internal";
import {
	codePointCount,
	FormattedTextAsTree,
	type TextAsTree,
	TreeAlpha,
	utf16LengthForCodePoints,
} from "@fluidframework/tree/internal";
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

import { runGuarded } from "../shared/index.js";

import {
	clipboardFormatMatcher,
	formatToFullQuillAttributes,
	formatToQuillAttributes,
	lineTagToQuillAttributes,
	parseLineTag,
	quillAttributesToFormat,
	quillAttributesToPartial,
} from "./quillAttributeUtils.js";

// Re-export the public attribute helpers so the existing public surface of this module is preserved.
export {
	clipboardFormatMatcher,
	parseCssFontFamily,
	parseCssFontSize,
	parseLineTag,
} from "./quillAttributeUtils.js";

// Workaround for quill-delta's export style not working well with node16 module resolution.
type Delta = DeltaPackage.default;
type QuillDeltaOp = DeltaPackage.Op;
const Delta = DeltaPackage.default;

/**
 * Props for the FormattedMainView component.
 * @input @internal
 */
export interface FormattedMainViewProps extends TextEditorProps {
	/** The formatted text tree to edit. */
	readonly root: PropTreeNode<FormattedTextAsTree.Tree>;
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
	({ root, undoRedo, editLabel }, ref) => {
		return (
			<FormattedTextEditorView
				root={root}
				undoRedo={undoRedo}
				editLabel={editLabel}
				ref={ref}
			/>
		);
	},
);
FormattedMainView.displayName = "FormattedMainView";

/** Create a StringAtom containing a StringLineAtom with the given line tag. */
function createLineAtom(
	lineTag: FormattedTextAsTree.LineTag,
	indent: number = 0,
): FormattedTextAsTree.FormattedAtomInsertable<
	FormattedTextAsTree.CharacterFormat,
	FormattedTextAsTree.StringLineAtom
> {
	return {
		content: new FormattedTextAsTree.StringLineAtom({
			tag: lineTag,
			indent,
		}),
		format: new FormattedTextAsTree.CharacterFormat(quillAttributesToFormat()),
	};
}

/**
 * Convert {@link TextAsTree.TextOp}s from `onContentChanged` into Quill delta ops
 * that can be applied via `Quill.updateContents()`.
 *
 * @remarks
 * `insert` ops read formatting from the tree atoms at the insertion position.
 * Consecutive atoms with identical formatting are grouped into a single Quill op
 * using `getUniformRun` for efficiency.
 * `remove` ops become Quill `delete` ops.
 * `retain` ops without `formattingChanged` pass through as plain retains.
 * `retain` ops with `formattingChanged: true` read the current formatting from the
 * tree and produce Quill retain ops with full attribute sets so that Quill's
 * display matches the new tree state.
 *
 * `preEditContent` is the Quill document text (via `quill.getText()`) captured
 * before applying these ops. It is needed to compute the UTF-16 width of removed
 * atoms, which are no longer present in the tree after the edit.
 *
 * Returns `undefined` when the tree is out of sync with the delta (e.g., a concurrent edit raced with event delivery).
 * The caller should fall back to a full diff in that case.
 */
function contentOpsToQuillDelta(
	root: FormattedTextAsTree.Tree,
	ops: readonly TextAsTree.TextOp[],
	preEditContent: string,
): QuillDeltaOp[] | undefined {
	const quillOps: QuillDeltaOp[] = [];
	// treePos: atom index in the post-edit tree. Advances for retain and insert, not remove.
	let treePos = 0;
	// quillPos: UTF-16 index in preEditContent. Advances for retain and remove, not insert.
	let quillPos = 0;
	// Cache the atoms array so we don't pay tree-traversal cost on every index read.
	const atoms = root.charactersWithFormatting();

	for (const op of ops) {
		if (op.type === "retain" && op.formattingChanged !== true) {
			if (treePos + op.count > atoms.length) {
				// Tree is out of sync with the delta. Signal the caller to fall back.
				return undefined;
			}
			// No formatting change — plain retain.
			// Use getString to get the actual UTF-16 width of these atoms.
			const text = root.getString(treePos, treePos + op.count);
			quillOps.push({ retain: text.length });
			treePos += op.count;
			quillPos += text.length;
		} else if (op.type === "retain") {
			// At least one character in this range had a deep change (e.g. formatting update).
			// Read current formatting and produce retain ops with full attributes.
			const retainEnd = treePos + op.count;
			let i = treePos;
			while (i < retainEnd) {
				const atom = atoms[i];
				if (atom === undefined) {
					// Tree is out of sync with the delta. Signal the caller to fall back.
					return undefined;
				}

				if (atom.content instanceof FormattedTextAsTree.StringLineAtom) {
					// Line atom is always "\n" — 1 UTF-16 unit.
					const attributes: Record<string, unknown> = formatToFullQuillAttributes(atom.format);
					const lineTag = atom.content.tag.value;
					Object.assign(attributes, lineTagToQuillAttributes[lineTag]);
					// Emit indent (including 0) so Quill clears a previously non-zero value.
					// eslint-disable-next-line unicorn/no-null
					attributes.indent = atom.content.indent > 0 ? atom.content.indent : null;
					quillOps.push({ retain: 1, attributes });
					i++;
					quillPos++;
				} else {
					// Text atom: group consecutive atoms with the same formatting.
					const runLength = Math.min(root.getUniformRun(i, retainEnd), retainEnd - i);
					const text = root.getString(i, i + runLength);
					const attributes = formatToFullQuillAttributes(atom.format);
					quillOps.push({ retain: text.length, attributes });
					i += runLength;
					quillPos += text.length;
				}
			}
			treePos = retainEnd;
		} else if (op.type === "insert") {
			// New characters inserted — read formatting from the tree.
			const insertEnd = treePos + codePointCount(op.text);
			let i = treePos;
			while (i < insertEnd) {
				const atom = atoms[i];
				if (atom === undefined) {
					// Tree is out of sync with the delta. Signal the caller to fall back.
					return undefined;
				}

				if (atom.content instanceof FormattedTextAsTree.StringLineAtom) {
					// Line atom: insert newline with line tag attributes.
					const attributes: Record<string, unknown> = {};
					const lineTag = atom.content.tag.value;
					Object.assign(attributes, lineTagToQuillAttributes[lineTag]);
					if (atom.content.indent) {
						attributes.indent = atom.content.indent;
					}
					const quillOp: QuillDeltaOp = { insert: "\n" };
					if (Object.keys(attributes).length > 0) {
						quillOp.attributes = attributes;
					}
					quillOps.push(quillOp);
					i++;
				} else {
					// Text atom: group consecutive atoms with the same formatting.
					const runLength = Math.min(root.getUniformRun(i, insertEnd), insertEnd - i);
					const text = root.getString(i, i + runLength);
					const attributes = formatToQuillAttributes(atom.format);
					const quillOp: QuillDeltaOp = { insert: text };
					if (Object.keys(attributes).length > 0) {
						quillOp.attributes = attributes;
					}
					quillOps.push(quillOp);
					i += runLength;
				}
			}
			treePos = insertEnd;
			// quillPos does not advance: inserts are new content not in preEditContent.
		} else {
			// remove: atoms are gone from the tree; use preEditContent to get UTF-16 width.
			const utf16Count = utf16LengthForCodePoints(preEditContent, quillPos, op.count);
			quillOps.push({ delete: utf16Count });
			quillPos += utf16Count;
			// treePos does not advance — removed atoms are not in the new tree.
		}
	}

	return quillOps;
}

/**
 * Apply a Quill `Delta` (the editor's outgoing change description) to a {@link FormattedTextAsTree.Tree}.
 *
 * @remarks
 * This is the inverse of {@link contentOpsToQuillDelta}: Quill produces a Delta of `retain`/`insert`/`delete`
 * ops describing how the user edited the document; this function walks the ops and applies the equivalent
 * mutations to the tree. The five attribute-bearing retain cases (line tag swap, implicit trailing newline,
 * indent-only, clearing line formatting, normal character formatting) are mutually exclusive.
 *
 * If the tree is part of a hydrated branch, the mutations are wrapped in a transaction so they undo/redo
 * as one atomic unit. Unhydrated trees apply the edits directly.
 *
 * Quill uses UTF-16 code units for positions; the tree uses Unicode code points. We track both
 * (`utf16Pos`, `cpPos`) and convert as ops advance.
 *
 * Exported for unit testing.
 * @internal
 */
export function applyQuillDeltaToTree(
	root: FormattedTextAsTree.Tree,
	delta: Delta,
	label?: unknown,
): void {
	const applyDelta = (): void => {
		// Snapshot of root.fullString() that we incrementally maintain in lockstep with the
		// tree mutations below, so we can resolve UTF-16 positions without re-reading the tree
		// on every op.
		let content = root.fullString();
		let utf16Pos = 0; // Position in UTF-16 code units (Quill's view)
		let cpPos = 0; // Position in code points (tree's view)

		for (const op of delta.ops) {
			if (op.retain !== undefined) {
				// The docs for retain imply this is always a number, but the type definitions allow a record here.
				// It is unknown why the type definitions allow a record as they have no doc comments.
				// For now this assert seems to be passing, so we just assume its always a number.
				assert(
					typeof op.retain === "number",
					0xcdf /* Expected retain count to be a number */,
				);
				// Convert UTF-16 retain count to code point count
				const retainedStr = content.slice(utf16Pos, utf16Pos + op.retain);
				const cpCount = codePointCount(retainedStr);

				if (op.attributes) {
					const lineTag = parseLineTag(op.attributes);
					const indent =
						typeof op.attributes.indent === "number" ? op.attributes.indent : undefined;
					// Case 1: Applying line formatting (header/list) to an existing newline in the document.
					if (lineTag !== undefined && content[utf16Pos] === "\n") {
						// Swap existing newline atom to StringLineAtom
						root.removeRange(cpPos, cpPos + 1);
						root.insertWithFormattingAt(cpPos, [createLineAtom(lineTag, indent)]);
						// Case 2: Applying line formatting past the end of content. Quill's implicit trailing newline.
					} else if (lineTag !== undefined && utf16Pos >= content.length) {
						// Quill's implicit trailing newline — insert a new line atom
						root.insertWithFormattingAt(cpPos, [createLineAtom(lineTag, indent)]);
						content += "\n";
						// Case 3: indent-only change on existing line atom
					} else if (
						lineTag === undefined &&
						"indent" in op.attributes &&
						!("header" in op.attributes) &&
						!("list" in op.attributes) &&
						!("blockquote" in op.attributes) &&
						!("code-block" in op.attributes) &&
						content[utf16Pos] === "\n"
					) {
						// Indent only change on an existing line atom
						const lineAtom = root.charactersWithFormatting()[cpPos]?.content;
						if (lineAtom instanceof FormattedTextAsTree.StringLineAtom) {
							lineAtom.indent = indent ?? 0;
						}
						// Case 4: clearing line formatting. Deletes StringLineAtom and inserts a plain
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
						// Case 5: Normal character formatting (bold, italic, size, etc...)
					} else {
						root.formatRange(cpPos, cpPos + cpCount, quillAttributesToPartial(op.attributes));
					}
				}
				utf16Pos += op.retain;
				cpPos += cpCount;
			} else if (op.delete !== undefined) {
				// Convert UTF-16 delete count to code point count
				const deletedStr = content.slice(utf16Pos, utf16Pos + op.delete);
				const cpCount = codePointCount(deletedStr);

				root.removeRange(cpPos, cpPos + cpCount);
				// Update content to reflect deletion for future position calculations
				content = content.slice(0, utf16Pos) + content.slice(utf16Pos + op.delete);
				// Don't advance positions - next op starts at same position
			} else if (typeof op.insert === "string") {
				const lineTag = parseLineTag(op.attributes);
				const indent =
					typeof op.attributes?.indent === "number" ? op.attributes.indent : undefined;
				if (lineTag !== undefined && op.insert === "\n") {
					root.insertWithFormattingAt(cpPos, [createLineAtom(lineTag, indent)]);
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
				cpPos += codePointCount(op.insert);
			}
		}
	};
	// Route through `TreeAlpha.context().runTransaction` so the optional label travels
	// onto the resulting commit. This is what lets the editor's scoped undo/redo find
	// these commits — unlabeled commits would only show up in the global undo stack.
	// Mirrors the plain text view's transaction pattern (`quillView.tsx` / `plainTextView.tsx`).
	const context = TreeAlpha.context(root);
	if (context.isBranch()) {
		context.runTransaction(applyDelta, label === undefined ? undefined : { label });
	} else {
		// If this node does not have a corresponding branch, then it is unhydrated.
		// Apply edits directly without a transaction.
		applyDelta();
	}
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

			// If the line has a nonzero indent, include that as well.
			// Omit indent 0 so that "indent" in op.attributes is false for unindented lines.
			if (atom.content.indent) {
				currentAttributes.indent = atom.content.indent;
			}
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
 * This component uses event-based synchronization via
 * {@link FormattedTextAsTree.Members.onContentChanged} to efficiently apply external
 * changes without rebuilding the full delta from the tree. Structural changes
 * (insert/remove) and formatting changes are applied incrementally through Quill's
 * delta operations.
 */
const FormattedTextEditorView = forwardRef<
	FormattedEditorHandle,
	{
		root: PropTreeNode<FormattedTextAsTree.Tree>;
		undoRedo?: UndoRedo;
		editLabel?: unknown;
	}
>(({ root: propRoot, undoRedo, editLabel }, ref) => {
	// Unwrap the PropTreeNode to get the actual tree node
	const root = unwrapPropTreeNode(propRoot);
	// DOM element where Quill will mount its editor
	const editorRef = useRef<HTMLDivElement>(null);
	// Quill instance, persisted across renders to avoid re-initialization
	const quillRef = useRef<Quill | undefined>(undefined);
	// Guards against update loops between Quill and the tree
	const isUpdating = useRef(false);
	// Container element for undo/redo button portal
	const [undoRedoContainer, setUndoRedoContainer] = useState<HTMLElement | undefined>(
		undefined,
	);
	// Force re-render when undo/redo state changes
	const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

	// Effective label: explicit prop or the root node itself as the default.
	const effectiveLabel = editLabel ?? root;
	// Ref so the one-time Quill setup effect always sees the current effective label.
	const editLabelRef = useRef(effectiveLabel);
	editLabelRef.current = effectiveLabel;

	// Expose undo/redo methods via ref. Calls are scoped to this editor's label so external
	// callers see the same per-editor undo/redo history as the toolbar buttons.
	useImperativeHandle(ref, () => ({
		undo: () => undoRedo?.undo(effectiveLabel),
		redo: () => undoRedo?.redo(effectiveLabel),
	}));

	// Initialize Quill editor with formatting toolbar using Quill provided CSS
	useEffect(() => {
		if (!editorRef.current || quillRef.current) {
			return;
		}

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
					[{ list: "bullet" }, { list: "ordered" }, { list: "check" }],
					["blockquote", "code-block"],
					["clean"],
				],
				clipboard: { matchers: [[Node.ELEMENT_NODE, clipboardFormatMatcher]] },
			},
		});

		// Set initial content from tree
		quill.setContents(buildDeltaFromTree(root));

		// Listen to local Quill changes and apply them to the tree.
		// We process delta operations to make targeted edits, preserving collaboration integrity.
		// Note: Quill uses UTF-16 code units for positions, but the tree uses Unicode code points.
		// We must convert between them to handle emoji and other non-BMP characters correctly.
		//
		// The typing here is very fragile: if no parameter types are given,
		// the inference for this event is strongly typed, but the types are wrong (The wrong "Delta" type is provided).
		// This is likely related to the node16 module resolution issues with quill-delta.
		// If we break that inference by adding types, `any` is inferred for all of them, so incorrect types here would still compile.
		const handleTextChange = (delta: Delta, _oldDelta: Delta, source: EmitterSource): void => {
			if (source !== "user") return;
			runGuarded(isUpdating, () => {
				// Pass `editLabelRef.current` so the resulting commit is labeled and reachable
				// from this editor's scoped undo/redo (rather than only the global undo stack).
				applyQuillDeltaToTree(root, delta, editLabelRef.current);
			});
		};

		quill.on("text-change", handleTextChange);
		quillRef.current = quill;

		// Create container for React-controlled undo/redo buttons and prepend to toolbar
		const editor = editorRef.current;
		const toolbar = editor.previousElementSibling as HTMLElement;
		const container = document.createElement("span");
		container.className = "ql-formats";
		toolbar.prepend(container);
		setUndoRedoContainer(container);

		return () => {
			quill.off("text-change", handleTextChange);
			quillRef.current = undefined;
			setUndoRedoContainer(undefined);
			// Clear Quill's DOM modifications so the container is clean for any remount.
			toolbar.remove();
			editor.innerHTML = "";
			editor.className = "";
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sync Quill when tree changes externally (e.g., from remote collaborators).
	// Subscribes to incremental content-level deltas via onContentChanged which
	// captures both shallow changes (insert/remove) and deep changes (formatting updates)
	// (via formattingChanged flag on retain ops), replacing the previous approach
	// of rebuilding the full delta from the tree and diffing on every change.
	useEffect(() => {
		return root.onContentChanged((ops) => {
			runGuarded(isUpdating, () => {
				if (!quillRef.current) return;
				let quillOps: QuillDeltaOp[] | undefined;
				if (ops !== undefined) {
					// Try incremental delta translation first.
					// Capture Quill's pre-edit content for remove op UTF-16 width calculation.
					quillOps = contentOpsToQuillDelta(root, ops, quillRef.current.getText());
				}

				if (quillOps === undefined) {
					// Delta unavailable or tree out-of-sync — fall back to full diff.
					const treeDelta = buildDeltaFromTree(root);
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					const quillDelta: Delta = quillRef.current.getContents();
					const diff = new Delta(quillDelta).diff(new Delta(treeDelta));
					if (diff.ops.length > 0) {
						quillRef.current.updateContents(diff.ops);
					}
				} else if (quillOps.length > 0) {
					quillRef.current.updateContents(quillOps, "api");
				}
			});
			// Refresh undo/redo button state — undo/redo availability changes alongside tree mutations.
			if (undoRedo) forceUpdate();
		});
	}, [root, undoRedo]);

	// Render undo/redo buttons via portal into Quill toolbar.
	// canUndo/canRedo and undo/redo are scoped to this editor's effective label.
	const undoRedoButtons = undoRedoContainer
		? ReactDOM.createPortal(
				<>
					<button
						type="button"
						className="ql-undo"
						aria-label="Undo"
						disabled={undoRedo?.canUndo(effectiveLabel) !== true}
						onClick={() => undoRedo?.undo(effectiveLabel)}
					/>
					<button
						type="button"
						className="ql-redo"
						aria-label="Redo"
						disabled={undoRedo?.canRedo(effectiveLabel) !== true}
						onClick={() => undoRedo?.redo(effectiveLabel)}
					/>
				</>,
				undoRedoContainer,
			)
		: undefined;

	return (
		<div
			style={{ height: "100%", display: "flex", flexDirection: "column" }}
			onClick={() => quillRef.current?.focus()}
		>
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
			<div
				ref={editorRef}
				style={{
					flex: 1,
					minHeight: "300px",
					border: "1px solid #ccc",
					borderRadius: "4px",
					cursor: "text",
				}}
			/>
			{undoRedoButtons}
		</div>
	);
});
FormattedTextEditorView.displayName = "FormattedTextEditorView";
