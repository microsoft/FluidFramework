/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, compareArrays, debugAssert, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	EmptyKey,
	forEachNodeSubsequence,
	type FieldKey,
	type ITreeCursorSynchronous,
	type TreeValue,
} from "../core/index.js";
import { currentObserver, buildNodeComparator } from "../feature-libraries/index.js";
import { TreeAlpha, Tree as TreeStatic } from "../shared-tree/index.js";
import {
	enumFromStrings,
	getInnerNode,
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeArrayNode,
	TreeBeta,
	createCustomizedFluidFrameworkScopedFactory,
	SchemaFactoryBeta,
	isObjectNodeSchema,
	eraseSchemaDetailsSubclassable,
} from "../simple-tree/index.js";
import type {
	TreeNodeSchema,
	LazyItem,
	ImplicitAllowedTypes,
	TreeFieldFromImplicitField,
	InsertableTypedNode,
	TreeNodeFromImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
	InsertableTreeFieldFromImplicitField,
	NodeKind,
	TreeNode,
	ScopedSchemaName,
	ErasedSchemaSubclassable,
	ErasedNode,
} from "../simple-tree/index.js";
import { brand, mapIterable, validateIndex, validateIndexRange } from "../util/index.js";

import {
	charactersFromString,
	processCharactersChangedDelta,
	type TextAsTree,
} from "./textDomain.js";

/**
 * Sets up scope for formatted text schema built-in types.
 * @remarks User-provided factory scoping will be applied as `com.fluidframework.text.formatted<user-scope>`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Inferring is the most practical option here
function createFormattedScopedFactory<TUserScope extends string>(
	inputSchemaFactory: SchemaFactoryBeta<TUserScope>,
) {
	return createCustomizedFluidFrameworkScopedFactory(inputSchemaFactory, "text.formatted");
}

/**
 * Schema factory for formatted text types which are not generic.
 */
const sfStatic = new SchemaFactoryAlpha("com.fluidframework.text.formatted");

/**
 * Factory for formatted text schema as a function of the formatting and the embedded object (atom) types.
 *
 * TODO: This will eventually be exposed as the user facing API.
 */
function createSchema<
	const TUserScope extends string,
	const FormatSchema extends ImplicitAllowedTypes,
	const ExtraAtomsSchema extends readonly LazyItem<
		TreeNodeSchema<string, NodeKind, FormattedTextAsTree.TextAtom & TreeNode>
	>[],
>(
	inputSchemaFactory: SchemaFactoryBeta<TUserScope>,
	formatSchema: FormatSchema,
	extraAtoms: ExtraAtomsSchema,
	defaultFormatInsertable: InsertableTreeFieldFromImplicitField<FormatSchema>,
): FormattedTextAsTree.FormattedTextSchema<TUserScope, FormatSchema, ExtraAtomsSchema> {
	const atoms = [FormattedTextAsTree.StringTextAtom, ...extraAtoms] as const;

	const sf = createFormattedScopedFactory(inputSchemaFactory);

	type Members = FormattedTextAsTree.FormattedTextMembers<FormatSchema, ExtraAtomsSchema>;

	class TextNode
		extends sf.object("Text", {
			content: SchemaFactory.required([() => StringArray], { key: EmptyKey }),
		})
		implements Members
	{
		public defaultFormat: TreeFieldFromImplicitField<FormatSchema> =
			TreeBeta.create<FormatSchema>(formatSchema, defaultFormatInsertable);

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
			format?: TreeFieldFromImplicitField<FormatSchema>,
		): TextNode {
			// Use `this` rather than `TextNode` so the more derived schema class is constructed when using this as a static on a subclass.
			return new this({
				content: [
					// Constructing an ArrayNode from an iterator is supported, so creating an array from the iterable of characters seems like it's not necessary here,
					// but to reduce the risk of incorrect data interpretation, we actually ban this in the special case where the iterable is a string directly, which is the case here.
					// Thus the array construction here is necessary to avoid a runtime error.
					...textAtomsFromString(
						value,
						format ?? TreeBeta.create<FormatSchema>(formatSchema, defaultFormatInsertable),
					),
				],
			});
		}

		public charactersWithFormatting(): readonly StringAtom[] {
			return this.content;
		}
		public insertWithFormattingAt(
			index: number,
			additionalCharacters: Iterable<InsertableTypedNode<typeof StringAtom>>,
		): void {
			this.content.insertAt(index, TreeArrayNode.spread(additionalCharacters));
		}

		public formatRange(
			start: number | undefined,
			end: number | undefined,
			format: Partial<TreeNodeFromImplicitAllowedTypes<FormatSchema>>,
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

			const fieldFormats = Object.entries(format) as [
				keyof TreeNodeFromImplicitAllowedTypes<FormatSchema>,
				unknown,
			][];

			TreeAlpha.context(this).runTransaction(() => {
				for (let i = formatStart; i < formatEnd; i++) {
					const atom = this.content[i];
					// Range validated above, so this should never fail.
					assert(atom !== undefined, "Index out of bounds while formatting text range.");
					const formatNode: TreeNode | TreeValue = atom.format;
					const atomFormatSchema = TreeStatic.schema(formatNode);
					if (!isObjectNodeSchema(atomFormatSchema)) {
						// TODO: redesign this API to work with all allowed FormatSchema types.
						throw new UsageError(
							"formatRange currently only supports object nodes for the format.",
						);
					}
					for (const [key, value] of fieldFormats) {
						// Object.entries should only return string keyed enumerable own properties.
						// The TypeScript typing does not account for this, and thus this assertion is necessary for this code to compile.
						assert(
							typeof key === "string",
							0xcc8 /* Object.entries returned a non-string key. */,
						);

						const field = atomFormatSchema.fields.get(key);
						if (field === undefined) {
							throw new UsageError(`Unknown format key: ${key}`);
						}

						// Ensures that if the input is a node, it is cloned before being inserted into the tree.
						const clonedValue = TreeBeta.clone(TreeBeta.create(field, value as never)) as
							| TreeNode
							| TreeValue;

						(
							formatNode as unknown as Record<
								keyof TreeNodeFromImplicitAllowedTypes<FormatSchema>,
								TreeNode | TreeValue
							>
						)[key] = clonedValue;
					}
				}
			});
		}

		/**
		 * Returns the {@link  FormattedTextAsTree.TextAtom.content} at the given atom index, or `undefined` if out of bounds.
		 */
		private getAtomCharacterAt(index: number): string | undefined {
			const atom = this.content[index];
			if (atom === undefined) return undefined;
			return atom.content.content;
		}

		public onCharactersChanged(
			callback: (ops: readonly TextAsTree.TextOp[] | undefined) => void,
		): () => void {
			return TreeAlpha.on(this.content, "nodeChanged", ({ delta }) =>
				processCharactersChangedDelta(
					delta,
					(index) => this.getAtomCharacterAt(index),
					callback,
				),
			);
		}

		public onContentChanged(
			callback: (ops: readonly TextAsTree.TextOp[] | undefined) => void,
		): () => void {
			return TreeAlpha.on(this.content, "treeChanged", ({ delta }) =>
				processCharactersChangedDelta(
					delta,
					(index) => this.getAtomCharacterAt(index),
					callback,
				),
			);
		}

		public getUniformRun(startIndex: number, endIndex?: number): number {
			return this.content.getUniformRun(startIndex, endIndex);
		}

		public getString(startIndex: number, endIndex?: number): string {
			return this.content.getString(startIndex, endIndex);
		}
	}

	function textAtomsFromString(
		value: string,
		format: TreeFieldFromImplicitField<FormatSchema>,
	): Iterable<StringAtom> {
		const result = mapIterable(charactersFromString(value), (char) => {
			const textAtom = new FormattedTextAsTree.StringTextAtom({ content: char });
			const data = {
				content: textAtom,
				format: TreeBeta.clone<FormatSchema>(format),
			};
			return new StringAtom(data as never); // Generic break type safety here. TODO: try and make safer.
		});
		return result;
	}

	class StringArray extends sf.array("StringArray", [() => StringAtom]) {
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

		private getCharactersSubarray(startIndex: number, endIndex: number): string[] {
			return this.withBorrowedSequenceCursor((cursor) => {
				const result: string[] = [];
				forEachNodeSubsequence(cursor, startIndex, endIndex, () => {
					debugAssert(
						() =>
							(cursor.type as string) === StringAtom.identifier ||
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
					result.push(content);
				});
				return result;
			});
		}

		public charactersCopy(): string[] {
			return this.getCharactersSubarray(0, this.length);
		}

		public fullString(): string {
			return this.charactersCopy().join("");
		}

		public getString(startIndex: number, endIndex: number = this.length): string {
			validateIndexRange(startIndex, endIndex, this, "FormattedTextAsTree.getString");
			return this.getCharactersSubarray(startIndex, endIndex).join("");
		}

		public getUniformRun(startIndex: number, endIndex: number = this.length): number {
			validateIndexRange(startIndex, endIndex, this, "FormattedTextAsTree.getUniformRun");
			if (endIndex === startIndex) {
				throw new UsageError("endIndex must be greater than startIndex for getUniformRun.");
			}
			const arrayLength = this.length;
			return this.withBorrowedSequenceCursor((cursor) => {
				cursor.enterNode(startIndex);

				// Capture the content type of the first atom
				cursor.enterField(EmptyKey);
				cursor.enterNode(0);
				const contentType = cursor.type;
				cursor.exitNode();
				cursor.exitField();

				// Build a comparator from the format subtree of the first atom
				// This compares by field key
				cursor.enterField(formatKey);
				cursor.enterNode(0);
				const formatComparator = buildNodeComparator(cursor);
				cursor.exitNode();
				cursor.exitField();

				let runLength = 1;
				const limit = Math.min(endIndex, arrayLength) - startIndex;

				while (runLength < limit && cursor.nextNode()) {
					// Compare atom type
					cursor.enterField(EmptyKey);
					cursor.enterNode(0);
					const typeMatches = cursor.type === contentType;
					cursor.exitNode();
					cursor.exitField();
					if (!typeMatches) {
						break;
					}

					// Compare format subtree using the compiled comparator
					cursor.enterField(formatKey);
					cursor.enterNode(0);
					const formatMatches = formatComparator(cursor);
					cursor.exitNode();
					cursor.exitField();

					if (formatMatches !== true) {
						break;
					}

					runLength++;
				}
				cursor.exitNode();
				return runLength;
			});
		}
	}

	/**
	 * A unit of the text, with formatting.
	 */
	class StringAtom
		extends sf.object("StringAtom", {
			content: SchemaFactory.required(atoms, { key: EmptyKey }),
			format: SchemaFactory.required(formatSchema),
		})
		implements
			FormattedTextAsTree.FormattedAtom<
				TreeNodeFromImplicitAllowedTypes<FormatSchema>,
				TreeNodeFromImplicitAllowedTypes<typeof atoms>
			> {}

	/**
	 * Schema for a text node.
	 * @remarks
	 * See {@link FormattedTextAsTree.Members} for the API.
	 * See {@link FormattedTextAsTree.Statics} for static APIs on this Schema, including construction.
	 */
	const Tree = eraseSchemaDetailsSubclassable<Members, FormattedTextAsTree.Statics<Tree>>()(
		TextNode,
	);
	type Tree = ErasedNode<
		Members,
		FormattedTextAsTree.FormattedTextSchemaIdentifier<TUserScope>
	>;

	return Tree;
}

const defaultFormat = {
	bold: false,
	italic: false,
	underline: false,
	size: 12,
	font: "Arial",
} as const;

const formatKey: FieldKey = brand("format");

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
	 * Portion of a string with formatting.
	 * @sealed
	 * @internal
	 */
	export interface FormattedAtom<TFormat = CharacterFormat, TText = StringAtomContent> {
		readonly content: TText;
		format: TFormat;
	}

	/**
	 * Portion of a string.
	 * @internal
	 */
	export interface TextAtom {
		/**
		 * The content of the text atom, viewed as a string.
		 */
		readonly content: string;
	}

	/**
	 * Formatting options for characters.
	 * @internal
	 */
	export class CharacterFormat extends sfStatic.objectAlpha("CharacterFormat", {
		bold: SchemaFactory.boolean,
		italic: SchemaFactory.boolean,
		underline: SchemaFactory.boolean,
		size: SchemaFactory.number,
		font: SchemaFactory.string,
	}) {
		public static readonly defaultFormat = new CharacterFormat(defaultFormat);
	}

	/**
	 * Unit in the string representing a single character.
	 * @internal
	 */
	export class StringTextAtom
		extends sfStatic.object("StringTextAtom", {
			/**
			 * The underlying text content of this atom.
			 * @remarks
			 * This is typically a single Unicode code point, and thus may contain multiple UTF-16 surrogate pair code units.
			 * Using longer strings is still valid. For example, so users might store whole grapheme clusters here, or even longer sections of text.
			 * Anything combined into a single atom will be treated atomically, and can not be partially selected or formatted.
			 * Using larger atoms and splitting them as needed is NOT a recommended approach, since this will result in poor merge behavior for concurrent edits.
			 * Instead atoms should always be the smallest unit of text which will be independently selected, moved or formatted.
			 * @privateRemarks
			 * This content logically represents the whole atom's content, so using {@link EmptyKey} makes sense to help indicate that.
			 */
			content: SchemaFactory.required([SchemaFactory.string], { key: EmptyKey }),
		})
		implements TextAtom {}

	/**
	 * Tag with which a line in text can be formatted from HTML.
	 * @internal
	 */
	export const LineTag = enumFromStrings(sfStatic.scopedFactory("lineTag"), [
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"li",
		"ol",
		"checked",
		"unchecked",
		"blockquote",
		"codeBlock",
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
	 * Quill formats line attributes (headers, list, blockquote, etc... ) on the newline character
	 * and only lines using this atom can have line-specific formatting.
	 * The optional indent level mirrors Quill's indent attribute,
	 * which is applies to the line before the line break.
	 * Any tagged line can be indented independently.
	 * @internal
	 */
	export class StringLineAtom extends sfStatic.object("StringLineAtom", {
		tag: LineTag.schema,
		indent: SchemaFactory.number,
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
	 * Statics for text nodes.
	 * @internal
	 */
	export interface Statics<TTree = Tree> {
		/**
		 * Construct a {@link FormattedTextAsTree.(Tree:class)} from a string, where each character (as defined by iterating over the string) becomes a single character in the text node.
		 * @remarks This combines pairs of utf-16 surrogate code units into single characters as appropriate.
		 */
		fromString(value: string): TTree;
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
	 * @see {@link FormattedTextAsTree.(Tree:class)} for schema.
	 * @internal
	 */
	export interface Members<TFormatTree, TPartialFormat, TFormattedAtom, TFFormattedInsert>
		extends TextAsTree.Members {
		/**
		 * Format to use by default for text inserted with non-formatted APIs.
		 * @remarks
		 * This is not persisted in the tree, and observation of it is not tracked by the tree observation tracking.
		 * @privateRemarks
		 * Opt this into observation tracking.
		 */
		defaultFormat: TFormatTree;

		/**
		 * Gets an array type view of the characters currently in the text.
		 * @remarks
		 * This iterator matches the behavior of {@link (TreeArrayNode:interface)} with respect to edits during iteration.
		 * @privateRemarks
		 * Currently this is implemented by a node and changes with the text over time.
		 * We might not want to leak a node like this in the API.
		 * Providing a way to index and iterate separately might be better.
		 */
		charactersWithFormatting(): readonly TFormattedAtom[];

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
			additionalCharacters: Iterable<TFFormattedInsert>,
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
			format: TPartialFormat,
		): void;

		/**
		 * Returns the length of the run of characters starting at `startIndex` which have the same formatting and atom type, up to `endIndex`.
		 * @param startIndex - The starting index of the run.
		 * @param endIndex - The ending index (exclusive) of the run. Defaults to the end of the text.
		 */
		getUniformRun(startIndex: number, endIndex?: number): number;
		/**
		 * Returns a substring of the text from `startIndex` to `endIndex`
		 * @param startIndex - starting index (inclusive)
		 * @param endIndex - Optional ending index (exclusive). Defaults to the end of the text.
		 */
		getString(startIndex: number, endIndex?: number): string;

		/**
		 * Subscribe to all content changes on this text node, including both shallow
		 * changes (inserts/removes) and deep changes (formatting updates on existing characters).
		 * @param callback - Called after each change with a sequence of {@link TextAsTree.TextOp}s describing what changed,
		 * or `undefined` when a delta could not be computed (e.g. during a schema upgrade).
		 * @returns A cleanup function that unsubscribes the callback when called.
		 * @remarks
		 * Unlike {@link TextAsTree.Members.onCharactersChanged} which only fires on
		 * shallow changes (inserts and removes), this method also fires on deep changes —
		 * formatting property updates on existing characters.
		 * The {@link TextAsTree.TextRetainOp.formattingChanged} flag on retain ops
		 * indicates which character ranges had formatting updates.
		 *
		 * All counts in the delivered ops are in Unicode code points, not UTF-16 code units.
		 * For characters outside the Basic Multilingual Plane (e.g. emoji), one code point
		 * corresponds to two UTF-16 code units — convert before using the counts as string indices.
		 */
		onContentChanged(
			callback: (ops: readonly TextAsTree.TextOp[] | undefined) => void,
		): () => void;
	}

	/**
	 * Insertable shape for a formatted text atom used by {@link FormattedTextAsTree.Members.insertWithFormattingAt}.
	 * @internal
	 */
	export interface FormattedAtomInsertable<TFormat, TContent> {
		readonly content: TContent;
		readonly format: TFormat;
	}

	/**
	 * Schema identifier for the a generic formatted text schema.
	 * @privateRemarks
	 * Eventually this should probably be given a better name and/or made a system type in a system namespace.
	 * @internal
	 */
	export type FormattedTextSchemaIdentifier<TUserScope extends string> = ScopedSchemaName<
		`com.fluidframework.text.formatted<${TUserScope}>`,
		"Text"
	>;

	/**
	 * Helper for expressing the full set of formatted text atoms for a given schema.
	 * @privateRemarks
	 * Eventually this should probably be given a better name and/or made a system type in a system namespace.
	 * @internal
	 */
	export type FormattedTextAtoms<
		ExtraAtomsSchema extends readonly LazyItem<
			TreeNodeSchema<string, NodeKind, TextAtom & TreeNode>
		>[],
	> = readonly [typeof StringTextAtom, ...ExtraAtomsSchema];

	/**
	 * Helper for configuring {@link FormattedTextAsTree.Members}.
	 * @privateRemarks
	 * Eventually this should probably be inlined into `FormattedTextAsTree.Members` or made a system type in a system namespace.
	 * The approach should be evaluated after settling on a redesign of the `formatRange` API as that will impact what the type parameters are.
	 * @internal
	 */
	export type FormattedTextMembers<
		FormatSchema extends ImplicitAllowedTypes,
		ExtraAtomsSchema extends readonly LazyItem<
			TreeNodeSchema<string, NodeKind, TextAtom & TreeNode>
		>[],
	> = Members<
		TreeFieldFromImplicitField<FormatSchema>,
		Partial<TreeNodeFromImplicitAllowedTypes<FormatSchema>>,
		FormattedAtom<
			TreeNodeFromImplicitAllowedTypes<FormatSchema>,
			TreeNodeFromImplicitAllowedTypes<FormattedTextAtoms<ExtraAtomsSchema>>
		>,
		FormattedAtomInsertable<
			InsertableTreeNodeFromImplicitAllowedTypes<FormatSchema>,
			InsertableTreeNodeFromImplicitAllowedTypes<FormattedTextAtoms<ExtraAtomsSchema>>
		>
	>;

	/**
	 * A generic type for a formatted text schema.
	 * @internal
	 */
	export type FormattedTextSchema<
		TUserScope extends string,
		FormatSchema extends ImplicitAllowedTypes,
		ExtraAtomsSchema extends readonly LazyItem<
			TreeNodeSchema<string, NodeKind, TextAtom & TreeNode>
		>[],
	> = Statics<
		ErasedNode<
			FormattedTextMembers<FormatSchema, ExtraAtomsSchema>,
			FormattedTextSchemaIdentifier<TUserScope>
		>
	> &
		ErasedSchemaSubclassable<
			FormattedTextMembers<FormatSchema, ExtraAtomsSchema>,
			FormattedTextSchemaIdentifier<TUserScope>
		>;

	export class Tree extends createSchema(
		new SchemaFactoryBeta("default"),
		CharacterFormat,
		[StringLineAtom],
		defaultFormat,
	) {}
}
