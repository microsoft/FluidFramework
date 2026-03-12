/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, compareArrays, debugAssert, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { EmptyKey, mapCursorField, type ITreeCursorSynchronous } from "../core/index.js";
import { currentObserver } from "../feature-libraries/index.js";
import { TreeAlpha } from "../shared-tree/index.js";
import {
	enumFromStrings,
	eraseSchemaDetails,
	getInnerNode,
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeArrayNode,
	TreeBeta,
} from "../simple-tree/index.js";
import type {
	InsertableTypedNode,
	TreeNode,
	TreeNodeFromImplicitAllowedTypes,
	WithType,
} from "../simple-tree/index.js";
import { mapIterable, validateIndex, validateIndexRange } from "../util/index.js";

import { charactersFromString, type TextAsTree } from "./textDomain.js";

const sf = new SchemaFactoryAlpha("com.fluidframework.text.formatted");

class TextNode
	extends sf.object("Text", {
		content: SchemaFactory.required([() => StringArray], { key: EmptyKey }),
	})
	implements FormattedTextAsTree.Members
{
	public defaultFormat: FormattedTextAsTree.CharacterFormat =
		new FormattedTextAsTree.CharacterFormat(defaultFormat);

	public insertAt(index: number, additionalCharacters: string): void {
		this.content.insertAt(
			index,
			TreeArrayNode.spread(textAtomsFromString(additionalCharacters, this.defaultFormat)),
		);
	}

	public removeRange(index: number | undefined, end: number | undefined): void {
		this.content.removeRange(index, end);
	}

	public characters(): Iterable<string> {
		return mapIterable(this.content, (atom) => atom.content.content);
	}

	public charactersCopy(): string[] {
		const result = this.content.charactersCopy();
		debugAssert(
			() =>
				compareArrays(result, this.charactersCopy_reference()) ||
				"invalid charactersCopy optimizations",
		);
		return result;
	}

	public characterCount(): number {
		return this.content.length;
	}

	public fullString(): string {
		const result = this.content.fullString();
		debugAssert(
			() => result === this.fullString_reference() || "invalid fullString optimizations",
		);
		return result;
	}

	/**
	 * A non-optimized reference implementation of fullString.
	 */
	public fullString_reference(): string {
		return [...this.characters()].join("");
	}

	/**
	 * Unoptimized trivially correct implementation of charactersCopy.
	 */
	public charactersCopy_reference(): string[] {
		return [...this.characters()];
	}

	public static fromString(
		value: string,
		format?: FormattedTextAsTree.CharacterFormat,
	): TextNode {
		// Constructing an ArrayNode from an iterator is supported, so creating an array from the iterable of characters seems like it's not necessary here,
		// but to reduce the risk of incorrect data interpretation, we actually ban this in the special case where the iterable is a string directly, which is the case here.
		// Thus the array construction here is necessary to avoid a runtime error.
		return new TextNode({
			content: [
				...textAtomsFromString(
					value,
					format ?? new FormattedTextAsTree.CharacterFormat(defaultFormat),
				),
			],
		});
	}

	public charactersWithFormatting(): readonly FormattedTextAsTree.StringAtom[] {
		return this.content;
	}
	public insertWithFormattingAt(
		index: number,
		additionalCharacters: Iterable<InsertableTypedNode<typeof FormattedTextAsTree.StringAtom>>,
	): void {
		this.content.insertAt(index, TreeArrayNode.spread(additionalCharacters));
	}
	public formatRange(
		start: number | undefined,
		end: number | undefined,
		format: Partial<FormattedTextAsTree.CharacterFormat>,
	): void {
		const formatStart = start ?? 0;
		validateIndex(formatStart, this.content, "FormattedTextAsTree.formatRange", true);

		const formatEnd = Math.min(this.content.length, end ?? this.content.length);
		validateIndexRange(
			formatStart,
			formatEnd,
			this.content,
			"FormattedTextAsTree.formatRange",
		);

		const branch = TreeAlpha.branch(this);

		const applyFormatting = (): void => {
			for (let i = formatStart; i < formatEnd; i++) {
				const atom = this.content[i];
				if (atom === undefined) {
					throw new UsageError("Index out of bounds while formatting text range.");
				}
				for (const [key, value] of Object.entries(format) as [
					keyof FormattedTextAsTree.CharacterFormat,
					unknown,
				][]) {
					// Object.entries should only return string keyed enumerable own properties.
					// The TypeScript typing does not account for this, and thus this assertion is necessary for this code to compile.
					assert(
						typeof key === "string",
						0xcc8 /* Object.entries returned a non-string key. */,
					);
					const f = FormattedTextAsTree.CharacterFormat.fields.get(key);
					if (f === undefined) {
						throw new UsageError(`Unknown format key: ${key}`);
					}
					// Ensures that if the input is a node, it is cloned before being inserted into the tree.
					atom.format[key] = TreeBeta.clone(TreeBeta.create(f, value as never)) as never;
				}
			}
		};

		if (branch === undefined) {
			// If this node does not have a corresponding branch, then it is unhydrated.
			// I.e., it is not part of a collaborative session yet.
			// Therefore, we don't need to run the edits as a transaction.
			applyFormatting();
		} else {
			// Wrap all formatting operations in a single transaction for atomicity.
			branch.runTransaction(() => {
				applyFormatting();
			});
		}
	}
}

const defaultFormat = {
	bold: false,
	italic: false,
	underline: false,
	size: 12,
	font: "Arial",
} as const;

function textAtomsFromString(
	value: string,
	format: FormattedTextAsTree.CharacterFormat,
): Iterable<FormattedTextAsTree.StringAtom> {
	const result = mapIterable(
		charactersFromString(value),
		(char) =>
			new FormattedTextAsTree.StringAtom({
				content: { content: char },
				format: TreeBeta.clone<typeof FormattedTextAsTree.CharacterFormat>(format),
			}),
	);
	return result;
}

class StringArray extends sf.array("StringArray", [() => FormattedTextAsTree.StringAtom]) {
	public withBorrowedSequenceCursor<T>(f: (cursor: ITreeCursorSynchronous) => T): T {
		const innerNode = getInnerNode(this);
		// Since the cursor will be used to read content from the tree and won't track observations,
		// treat it as if it observed the whole subtree.
		currentObserver?.observeNodeDeep(innerNode);
		const cursor = innerNode.borrowCursor();
		cursor.enterField(EmptyKey);
		const result = f(cursor);
		cursor.exitField();
		return result;
	}

	public charactersCopy(): string[] {
		return this.withBorrowedSequenceCursor((cursor) =>
			mapCursorField(cursor, () => {
				debugAssert(
					() =>
						cursor.type === FormattedTextAsTree.StringAtom.identifier ||
						"invalid fullString type optimizations",
				);
				cursor.enterField(EmptyKey);
				cursor.enterNode(0);
				let content: string;
				switch (cursor.type) {
					case FormattedTextAsTree.StringTextAtom.identifier: {
						cursor.enterField(EmptyKey);
						cursor.enterNode(0);
						content = cursor.value as string;
						debugAssert(
							() => typeof content === "string" || "invalid fullString type optimizations",
						);
						cursor.exitNode();
						cursor.exitField();
						break;
					}
					case FormattedTextAsTree.StringLineAtom.identifier: {
						content = "\n";
						break;
					}
					default: {
						fail(0xcde /* Unsupported node type in text array */, () => `${cursor.type}`);
					}
				}
				cursor.exitNode();
				cursor.exitField();
				return content;
			}),
		);
	}

	public fullString(): string {
		return this.charactersCopy().join("");
	}
}

/**
 * A collection of text related types, schema and utilities for working with text beyond the basic {@link SchemaStatics.string}.
 * @privateRemarks
 * This has hard-coded assumptions about what kind of embedded content and what kind of formatting is supported.
 * We will want to generalize this with a more generic schema factory function like with table.
 * Then either that and/or the output from it can be package exported.
 * This version is just an initial prototype.
 * @internal
 */
export namespace FormattedTextAsTree {
	/**
	 * Formatting options for characters.
	 * @internal
	 */
	export class CharacterFormat extends sf.objectAlpha("CharacterFormat", {
		bold: SchemaFactory.boolean,
		italic: SchemaFactory.boolean,
		underline: SchemaFactory.boolean,
		size: SchemaFactory.number,
		font: SchemaFactory.string,
	}) {}

	/**
	 * Unit in the string representing a single character.
	 * @internal
	 */
	export class StringTextAtom extends sf.object("StringTextAtom", {
		/**
		 * The underlying text content of this atom.
		 * @remarks
		 * This is typically a single unicode codepoint, and thus may contain multiple utf-16 surrogate pair code units.
		 * Using longer strings is still valid. For example, so users might store whole grapheme clusters here, or even longer sections of text.
		 * Anything combined into a single atom will be treated atomically, and can not be partially selected or formatted.
		 * Using larger atoms and splitting them as needed is NOT a recommended approach, since this will result in poor merge behavior for concurrent edits.
		 * Instead atoms should always be the smallest unit of text which will be independently selected, moved or formatted.
		 * @privateRemarks
		 * This content logically represents the whole atom's content, so using {@link EmptyKey} makes sense to help indicate that.
		 */
		content: SchemaFactory.required([SchemaFactory.string], { key: EmptyKey }),
	}) {}

	/**
	 * Tag with which a line in text can be formatted from HTML.
	 * @internal
	 */
	export const LineTag = enumFromStrings(sf.scopedFactory("lineTag"), [
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"li",
	]);
	/**
	 * {@inheritdoc FormattedTextAsTree.(LineTag:variable)}
	 * @internal
	 */
	export type LineTag = TreeNodeFromImplicitAllowedTypes<typeof LineTag.schema>;

	/**
	 * Unit in the string representing a new line character with line formatting.
	 * @remarks
	 * This aligns with how Quill represents line formatting.
	 * Note that not all new lines will use this,
	 * but only ones using this can have line specific formatting.
	 * @internal
	 */
	export class StringLineAtom extends sf.object("StringLineAtom", {
		tag: LineTag.schema,
	}) {
		public readonly content = "\n";
	}

	/**
	 * Types of "atoms" that make up the text.
	 * @internal
	 */
	export const StringAtomContent = [StringTextAtom, StringLineAtom] as const;
	/**
	 * {@inheritdoc FormattedTextAsTree.(StringAtomContent:variable)}
	 * @internal
	 */
	export type StringAtomContent = TreeNodeFromImplicitAllowedTypes<typeof StringAtomContent>;

	/**
	 * A unit of the text, with formatting.
	 * @internal
	 */
	export class StringAtom extends sf.object("StringAtom", {
		content: SchemaFactory.required(StringAtomContent, { key: EmptyKey }),
		format: CharacterFormat,
	}) {}

	/**
	 * Statics for text nodes.
	 * @internal
	 */
	export interface Statics {
		/**
		 * Construct a {@link FormattedTextAsTree.(Tree:type)} from a string, where each character (as defined by iterating over the string) becomes a single character in the text node.
		 * @remarks This combines pairs of utf-16 surrogate code units into single characters as appropriate.
		 */
		fromString(value: string): Tree;
	}

	/**
	 * Interface for a text node.
	 * @remarks
	 * The string is broken up into substrings which are referred to as 'characters'.
	 * Unlike with JavaScript strings, all indexes are by character, not UTF-16 code unit.
	 * This avoids the problem JavaScript where it can split UTF-16 surrogate pairs producing invalid strings,
	 * and avoids the issue where indexing a string and iterating it segment the string differently.
	 * This does NOT mean the characters correspond to user perceived characters (like grapheme clusters try to do):
	 * applications will likely want to include higher level segmentation logic
	 * which might differ between operations like delete
	 * (which often operates on something in between unicode code points and grapheme clusters)
	 * and navigation/selection (which typically uses grapheme clusters).
	 *
	 * @see {@link FormattedTextAsTree.Statics.fromString} for construction.
	 * @see {@link FormattedTextAsTree.(Tree:type)} for schema.
	 * @internal
	 */
	export interface Members extends TextAsTree.Members {
		/**
		 * Format to use by default for text inserted with non-formatted APIs.
		 * @remarks
		 * This is not persisted in the tree, and observation of it is not tracked by the tree observation tracking.
		 * @privateRemarks
		 * Opt this into observation tracking.
		 */
		defaultFormat: CharacterFormat;

		/**
		 * Gets an array type view of the characters currently in the text.
		 * @remarks
		 * This iterator matches the behavior of {@link (TreeArrayNode:interface)} with respect to edits during iteration.
		 * @privateRemarks
		 * Currently this is implemented by a node and changes with the text over time.
		 * We might not want to leak a node like this in the API.
		 * Providing a way to index and iterate separately might be better.
		 */
		charactersWithFormatting(): readonly StringAtom[];

		/**
		 * Insert a range of characters into the string based on character index.
		 * @remarks
		 * See {@link (TreeArrayNode:interface).insertAt} for more details on the behavior.
		 * See {@link FormattedTextAsTree.Statics.fromString} for how the `additionalCharacters` string is broken into characters.
		 * @privateRemarks
		 * If we provide ways to customize character boundaries, that could be handled here by taking in an Iterable<string> instead of a string.
		 * Doing this currently would enable insertion of text with different character boundaries than the existing text,
		 * which would violate the currently documented character boundary invariants.
		 *
		 * Another option would be to take an approach like Table,
		 * where the user of the API uses a factory function to generate the schema, and can inject custom logic, like a string character iterator.
		 */
		insertWithFormattingAt(
			index: number,
			additionalCharacters: Iterable<InsertableTypedNode<typeof StringAtom>>,
		): void;

		/**
		 * Apply formatting to a range of characters based on character index.
		 * @param startIndex - The starting index (inclusive) of the range to format.
		 * @param endIndex - The ending index (exclusive) of the range to format.
		 * @param format - The formatting to apply to the specified range.
		 * @remarks
		 * The start and end behave the same as in {@link (TreeArrayNode:interface).removeRange}.
		 */
		formatRange(
			startIndex: number | undefined,
			endIndex: number | undefined,
			format: Partial<CharacterFormat>,
		): void;
	}

	/**
	 * Schema for a text node.
	 * @remarks
	 * See {@link FormattedTextAsTree.Members} for the API.
	 * See {@link FormattedTextAsTree.Statics} for static APIs on this Schema, including construction.
	 * @internal
	 */
	export const Tree = eraseSchemaDetails<Members, Statics>()(TextNode);
	export type Tree = Members & TreeNode & WithType<"com.fluidframework.text.formatted.Text">;
}
