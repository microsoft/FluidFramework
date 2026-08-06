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
	getInnerNode,
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeArrayNode,
	TreeBeta,
	createCustomizedFluidFrameworkScopedFactory,
	eraseSchemaDetails,
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
	SchemaFactoryBeta,
} from "../simple-tree/index.js";
import {
	brand,
	mapIterable,
	oneFromIterable,
	validateIndex,
	validateIndexRange,
} from "../util/index.js";

import {
	charactersFromString,
	expensiveInternalValidationAssert,
	processCharactersChangedDelta,
	type PlainText,
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

const formatKey: FieldKey = brand("format");

/**
 * Atom in the string containing a single character.
 * @privateRemarks
 * This is outside the namespace so it can be exported for testing, but not package exported.
 */
export class StringTextAtomNode
	extends sfStatic.object("StringTextAtom", {
		/**
		 * The underlying text content of this atom.
		 * @remarks
		 * This is typically a single Unicode code point, and thus may contain multiple UTF-16 surrogate pair code units.
		 * Longer strings are still valid. For example, users might store whole grapheme clusters here, or even longer sections of text.
		 * Anything combined into a single atom will be treated atomically, and can not be partially selected or formatted.
		 * Using larger atoms and splitting them as needed is NOT a recommended approach, since this will result in poor merge behavior for concurrent edits.
		 * Instead, atoms should always be the smallest unit of text which will be independently selected, moved or formatted.
		 * @privateRemarks
		 * This content logically represents the whole atom's content, so using {@link EmptyKey} makes sense to help indicate that.
		 */
		content: SchemaFactory.required([SchemaFactory.string], { key: EmptyKey }),
	})
	implements FormattedText.TextAtom
{
	public static fromCharacter(value: string): StringTextAtomNode {
		const character = oneFromIterable(charactersFromString(value));
		if (character === undefined) {
			throw new UsageError("value must contain exactly one Unicode character.");
		}
		return new StringTextAtomNode({ content: character });
	}

	public static fromString(value: string): StringTextAtomNode[] {
		return Array.from(
			charactersFromString(value),
			(character) => new StringTextAtomNode({ content: character }),
		);
	}
}

/**
 * A collection of text related types, schema and utilities for working with text beyond the basic {@link SchemaStatics.string}.
 *
 * @remarks
 * This is generic over formatting an embedded object/atom types.
 *
 * @privateRemarks
 * See {@link FormattedTextDefault} for an example parameterization.
 *
 * TODO:
 * - Add more comprehensive tests for generic parameterizations other than default.
 * - Sort out API around overwriting subsets of formatting information.
 * @alpha
 */
export namespace FormattedText {
	/**
	 * Creates a schema for a formatted text node, parameterized by the formatting and the embedded object (atom) types.
	 *
	 * @param inputSchemaFactory - The {@link SchemaFactoryBeta} used to scope the generated schema.
	 * The generated types are scoped under `com.fluidframework.text.formatted<TUserScope>`, where `TUserScope` is the scope of this factory.
	 * This scope is used to distinguish different usages of `createSchema` from each-other, and must be kept the same between versions for nodes to remain compatible.
	 * It must be different to distinguish different formatted text schema within the same document.
	 * @param formatSchema - Schema describing the formatting associated with each atom of text.
	 * Use an {@link NodeKind.Object|Object node} to support {@link FormattedText.Members.formatRange}.
	 * @param extraAtoms - Additional atom schema to allow as text content beyond the built-in {@link FormattedText.(StringTextAtom:variable)}.
	 * Use this to embed richer content (for example line breaks or inline objects) alongside plain characters.
	 * @param defaultFormatInsertable - The formatting applied to text inserted via non-formatted APIs
	 * (for example {@link FormattedText.Members.insertAt} and {@link FormattedText.Statics.fromString} when no explicit format is provided).
	 * @returns The schema for the formatted text node, whose nodes implement {@link FormattedText.Members} and whose statics implement {@link FormattedText.Statics}.
	 *
	 * @privateRemarks
	 * See {@link FormattedTextDefault} for an example parameterization of this factory.
	 *
	 * TODO: The choice to always include the built-in {@link FormattedText.(StringTextAtom:variable)} is a design decision that should be re-evaluated before stabilizing.
	 */
	export function createSchema<
		const TUserScope extends string,
		const FormatSchema extends ImplicitAllowedTypes,
		const ExtraAtomsSchema extends readonly LazyItem<
			TreeNodeSchema<string, NodeKind, TextAtom & TreeNode>
		>[],
	>(
		inputSchemaFactory: SchemaFactoryBeta<TUserScope>,
		formatSchema: FormatSchema,
		extraAtoms: ExtraAtomsSchema,
		defaultFormatInsertable: InsertableTreeFieldFromImplicitField<FormatSchema>,
	): FormattedTextSchema<TUserScope, FormatSchema, ExtraAtomsSchema> {
		const atoms = [StringTextAtom, ...extraAtoms] as const;
		/**
		 * The type of a text atom node, which goes in a StringAtom.
		 */
		type TextAtomNode = TreeNodeFromImplicitAllowedTypes<TextAtomSchemas<ExtraAtomsSchema>>;

		const sf = createFormattedScopedFactory(inputSchemaFactory);

		const defaultFormat: TreeFieldFromImplicitField<FormatSchema> =
			TreeBeta.create<FormatSchema>(formatSchema, defaultFormatInsertable);

		/**
		 * Gets a format node, which must be cloned before being inserted.
		 */
		function getFormatNode(
			format?: InsertableTreeFieldFromImplicitField<FormatSchema>,
		): TreeFieldFromImplicitField<FormatSchema> {
			// Note we cannot use the `format ?? defaultFormat` syntax as format is allowed to be `null`.
			return format === undefined
				? defaultFormat
				: TreeBeta.create<FormatSchema>(formatSchema, format);
		}

		function cloneFormat(
			format: TreeFieldFromImplicitField<FormatSchema>,
		): TreeFieldFromImplicitField<FormatSchema> &
			TreeNodeFromImplicitAllowedTypes<FormatSchema> {
			const clone: TreeFieldFromImplicitField<FormatSchema> =
				TreeBeta.clone<FormatSchema>(format);
			// TypeScript fails to prove that cloning a node gives a node, and not possible undefined (like cloning a empty field could).
			// This cast helps users of this function get the types they need.
			return clone as typeof clone & TreeNodeFromImplicitAllowedTypes<FormatSchema>;
		}

		class TextNode
			extends sf.object("Text", {
				content: SchemaFactory.required([() => StringArray], { key: EmptyKey }),
			})
			implements Members<FormatSchema, ExtraAtomsSchema>
		{
			public insertAt(
				index: number,
				additionalCharacters:
					| string
					| Iterable<TreeNodeFromImplicitAllowedTypes<TextAtomSchemas<ExtraAtomsSchema>>>,
				format?: InsertableTreeFieldFromImplicitField<FormatSchema>,
			): void {
				const newAtoms: Iterable<TextAtomNode> =
					typeof additionalCharacters === "string"
						? stringTextAtomsFromString(additionalCharacters)
						: additionalCharacters;
				const formatNode = getFormatNode(format);
				this.content.insertAt(
					index,
					TreeArrayNode.spread(stringAtomsFromTextAtoms(newAtoms, formatNode)),
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
				expensiveInternalValidationAssert(
					() =>
						compareArrays(result, this.#charactersCopy_reference()) ||
						"invalid charactersCopy optimizations",
				);
				return result;
			}

			public characterCount(): number {
				return this.content.length;
			}

			public fullString(): string {
				const result = this.content.fullString();
				expensiveInternalValidationAssert(
					() => result === this.#fullString_reference() || "invalid fullString optimizations",
				);
				return result;
			}

			/**
			 * A non-optimized reference implementation of fullString.
			 */
			#fullString_reference(): string {
				return [...this.characters()].join("");
			}

			/**
			 * Unoptimized trivially correct implementation of charactersCopy.
			 */
			#charactersCopy_reference(): string[] {
				return [...this.characters()];
			}

			public static fromString(
				value: string,
				format?: InsertableTreeFieldFromImplicitField<FormatSchema>,
			): TextNode {
				const formatNode = getFormatNode(format);
				// Use `this` rather than `TextNode` so the more derived schema class is constructed when using this as a static on a subclass.
				return new this({
					content: [
						// Constructing an ArrayNode from an iterator is supported, so creating an array from the iterable of characters seems like it's not necessary here,
						// but to reduce the risk of incorrect data interpretation, we actually ban this in the special case where the iterable is a string directly, which is the case here.
						// Thus the array construction here is necessary to avoid a runtime error.
						...textAtomsFromString(value, formatNode),
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
				const fieldFormatsRaw = Object.entries(format) as [
					keyof TreeNodeFromImplicitAllowedTypes<FormatSchema>,
					unknown,
				][];
				const fieldFormats = fieldFormatsRaw.map(([key, value]) => {
					// Object.entries should only return string keyed enumerable own properties.
					// The TypeScript typing does not account for this, and thus this assertion is necessary for this code to compile.
					assert(
						typeof key === "string",
						0xcc8 /* Object.entries returned a non-string key. */,
					);
					return [key, value] as const;
				});
				this.#editRange(start, end, "FormattedText.formatRange", (atom) => {
					const formatNode: TreeNode | TreeValue = atom.format;
					const atomFormatSchema = TreeStatic.schema(formatNode);
					if (!isObjectNodeSchema(atomFormatSchema)) {
						throw new UsageError(
							"formatRange currently only supports object nodes for the format.",
						);
					}
					for (const [key, value] of fieldFormats) {
						const field = atomFormatSchema.fields.get(key);
						if (field === undefined) {
							throw new UsageError(`Unknown format key: ${key}`);
						}

						// Ensures that if the input is a node, it is cloned before being inserted into the tree.
						// Note that since this uses field schema, `undefined` can pass through this if allowed by the schema.
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
				});
			}

			public reformat(
				start: number | undefined,
				end: number | undefined,
				format?: InsertableTreeFieldFromImplicitField<FormatSchema>,
			): void {
				const node = getFormatNode(format);
				this.#editRange(start, end, "FormattedText.reformat", (atom) => {
					atom.format = cloneFormat(node);
				});
			}

			/**
			 * Map an edit over a range of atoms, validating the range and running the edits in a transaction.
			 * @remarks
			 * This is not exposed in the API since this approach will have to be replaced when formatting is optimized,
			 * so we don't want users to directly depend on this un-optimizable layer.
			 */
			#editRange(
				start: number | undefined,
				end: number | undefined,
				method: string,
				edit: (atom: StringAtom) => void,
			): void {
				const formatStart = start ?? 0;
				validateIndex(formatStart, this.content, method, true);

				const formatEnd = Math.min(this.content.length, end ?? this.content.length);
				validateIndexRange(formatStart, formatEnd, this.content, method);

				TreeAlpha.context(this).runTransaction(() => {
					for (let i = formatStart; i < formatEnd; i++) {
						const atom = this.content[i];
						// Range validated above, so this should never fail.
						assert(
							atom !== undefined,
							0xd08 /* Index out of bounds while formatting text range. */,
						);
						edit(atom);
					}
				});
			}

			/**
			 * Returns the {@link  FormattedText.TextAtom.content} at the given atom index, or `undefined` if out of bounds.
			 */
			private getAtomCharacterAt(index: number): string | undefined {
				const atom = this.content[index];
				if (atom === undefined) return undefined;
				return atom.content.content;
			}

			public onCharactersChanged(
				callback: (ops: readonly PlainText.TextOp[] | undefined) => void,
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
				callback: (ops: readonly PlainText.TextOp[] | undefined) => void,
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

		function stringTextAtomsFromString(
			value: string,
		): Iterable<StringTextAtom & TextAtomNode> {
			// TypeScript can't prove in this Generic context that StringTextAtom is assignable to TextAtomNode, so we have to cast.
			// Since TextAtomSchemas unconditionally includes StringTextAtom, this cast is safe.
			return StringTextAtom.fromString(value) as (StringTextAtom & TextAtomNode)[];
		}

		function stringAtomsFromTextAtoms(
			value: Iterable<TreeNodeFromImplicitAllowedTypes<TextAtomSchemas<ExtraAtomsSchema>>>,
			format: TreeFieldFromImplicitField<FormatSchema>,
		): Iterable<StringAtom> {
			const result = mapIterable(value, (content) => {
				const data = {
					content,
					format: cloneFormat(format),
				};
				return new StringAtom(data as never); // Generic break type safety here. TODO: try and make safer.
			});
			return result;
		}

		function textAtomsFromString(
			value: string,
			format: TreeFieldFromImplicitField<FormatSchema>,
		): Iterable<StringAtom> {
			const textAtoms = stringTextAtomsFromString(value);
			return stringAtomsFromTextAtoms(textAtoms, format);
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
				const slowPathIndexes: number[] = [];
				const result: string[] = [];
				this.withBorrowedSequenceCursor((cursor) => {
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
							case StringTextAtom.identifier: {
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
							// TODO: we could optimize this for constant cases via an optional symbol on the atom schema holding the constant.
							// A less general optimization could just include cases for build in types with constant values
							// (like below commented code: currently this would cause a cyclical dependency but could be refactored).
							// case FormattedText.StringLineAtom.identifier: {
							// 	content = "\n";
							// 	break;
							// }
							default: {
								slowPathIndexes.push(result.length);
								content = ""; // Placeholder for slow path content
							}
						}
						cursor.exitNode();
						cursor.exitField();
						result.push(content);
					});
				});

				// Fill in slow path cases not optimized above.
				for (const index of slowPathIndexes) {
					const node =
						this[index + startIndex] ??
						fail(
							0xd09 /* getCharactersSubarray failed to find index after index range was checked */,
						);
					result[index] = node.content.content;
				}

				return result;
			}

			public charactersCopy(): string[] {
				return this.getCharactersSubarray(0, this.length);
			}

			public fullString(): string {
				return this.charactersCopy().join("");
			}

			public getString(startIndex: number, endIndex: number = this.length): string {
				validateIndexRange(startIndex, endIndex, this, "FormattedText.getString");
				return this.getCharactersSubarray(startIndex, endIndex).join("");
			}

			public getUniformRun(startIndex: number, endIndex: number = this.length): number {
				validateIndexRange(startIndex, endIndex, this, "FormattedText.getUniformRun");
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
				FormattedAtom<
					TreeNodeFromImplicitAllowedTypes<FormatSchema>,
					TreeNodeFromImplicitAllowedTypes<typeof atoms>
				> {}

		/**
		 * Schema for a text node.
		 * @remarks
		 * See {@link FormattedText.Members} for the API.
		 * See {@link FormattedText.Statics} for static APIs on this Schema, including construction.
		 * @privateRemarks
		 * eraseSchemaDetailsSubclassable risks user's defining subclass members which collide with internals.
		 * Ideally we would generate private members for non-public properties, but TypeScript does not support this.
		 * It is up to the user of eraseSchemaDetailsSubclassable to manage this risk.
		 *
		 * TODO: there is at least one collision prone member to worry about here: `content`.
		 */
		const Tree = eraseSchemaDetailsSubclassable<
			Members<FormatSchema, ExtraAtomsSchema>,
			Statics<Tree, FormatSchema>
		>()(TextNode);
		type Tree = ErasedNode<
			Members<FormatSchema, ExtraAtomsSchema>,
			FormattedTextSchemaIdentifier<TUserScope>
		>;

		return Tree;
	}

	/**
	 * Portion of a string with formatting.
	 * @privateRemarks
	 * This is implemented {@link StringAtom}, but we avoid leaking the fact this is a TreeNode in the API surface to
	 * preserve more future flexibility.
	 * @sealed
	 * @alpha
	 */
	export interface FormattedAtom<TFormat, TText> {
		/**
		 * Content which is formatted.
		 */
		readonly content: TText;
		/**
		 * Formatting which is applied to the content.
		 * @remarks
		 * Can be reassigned or deeply mutated to edit the formatting of the content.
		 */
		format: TFormat;
	}

	/**
	 * Portion of a string.
	 * @remarks
	 * Additional kinds of text atoms (also known as embedded objects) which can occur inside a string can implement this.
	 * The schema for them can then be provided to {@link FormattedText.createSchema}.
	 * @alpha
	 */
	export interface TextAtom {
		/**
		 * The content of the text atom, viewed as a string.
		 */
		readonly content: string;
	}

	/**
	 * Static factory functions for {@link FormattedText.(StringTextAtom:variable)}.
	 * @privateRemarks
	 * We type-erase `StringTextAtom` and only provide these static factories for construction
	 * to reduce the chance of someone accidentally creating a text atom for a string other than a single unicode code point.
	 * Other strings should work, but our intention is to provide no type-safe API which can produce them, so an application can take their lack of existence as an invariant if they want.
	 * It is still however possible to produce them, like export/import round trips with editing in the middle of the process, or collaboration with an equivalent schema which doesn't enforce this invariant.
	 * @sealed
	 * @alpha
	 */
	export interface StringTextAtomStatics {
		/**
		 * Creates an atom from exactly one Unicode code point.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if `value` does not contain exactly one Unicode code character.
		 */
		fromCharacter(value: string): StringTextAtom;

		/**
		 * Creates one atom for each Unicode code point in `value`.
		 */
		fromString(value: string): StringTextAtom[];
	}

	/**
	 * Schema for a {@link FormattedText.(StringTextAtom:variable)} node.
	 * @sealed
	 * @alpha
	 */
	export const StringTextAtom = eraseSchemaDetails<TextAtom, StringTextAtomStatics>()(
		StringTextAtomNode,
	);

	/**
	 * Node for the {@link FormattedText.(StringTextAtom:variable)} schema.
	 * @sealed
	 * @alpha
	 */
	export type StringTextAtom = ErasedNode<
		TextAtom,
		"com.fluidframework.text.formatted.StringTextAtom"
	>;

	/**
	 * Statics for formatted text nodes.
	 * @sealed
	 * @alpha
	 */
	export interface Statics<TTree, FormatSchema extends ImplicitAllowedTypes> {
		/**
		 * Construct a node of `this` schema from a string, where each character (as defined by iterating over the string) becomes a single character in the text node.
		 * @remarks This combines pairs of utf-16 surrogate code units into single characters as appropriate.
		 */
		fromString(
			value: string,
			format?: InsertableTreeFieldFromImplicitField<FormatSchema>,
		): TTree;
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
	 * @see {@link FormattedText.Statics.fromString} for construction.
	 * @see {@link FormattedText.createSchema} for creating schemas whose nodes implement this.
	 * @sealed
	 * @alpha
	 */
	export interface Members<
		FormatSchema extends ImplicitAllowedTypes,
		ExtraAtomsSchema extends readonly LazyItem<
			TreeNodeSchema<string, NodeKind, TextAtom & TreeNode>
		>[],
	> extends PlainText.Members {
		/**
		 * {@link PlainText.Members.insertAt} with optional formatting to apply to all additional characters,
		 * and allowing an array of atoms instead of a string.
		 * @param format - Optional formatting to apply to all additional characters. If not specified, the default formatting (from {@link FormattedText.createSchema}) will be used.
		 * @remarks
		 * Use {@link FormattedText.Members.insertWithFormattingAt} if you need to specify formatting for atom independently.
		 * @override
		 */
		insertAt(
			index: number,
			additionalCharacters:
				| string
				| Iterable<TreeNodeFromImplicitAllowedTypes<TextAtomSchemas<ExtraAtomsSchema>>>,
			format?: InsertableTreeFieldFromImplicitField<FormatSchema>,
		): void;

		/**
		 * Gets an array type view of the characters currently in the text.
		 * @remarks
		 * This iterator matches the behavior of {@link (TreeArrayNode:interface)} with respect to edits during iteration.
		 *
		 * For more efficient access, use {@link FormattedText.Members.getUniformRun} and {@link FormattedText.Members.getString} to access ranges of characters
		 * to avoid having to inspect the formatting on every atom.
		 * @privateRemarks
		 * Currently this is implemented by a node and changes with the text over time.
		 * We might not want to leak a node like this in the API.
		 * Providing a way to index and iterate separately might be better.
		 */
		charactersWithFormatting(): readonly FormattedAtom<
			TreeNodeFromImplicitAllowedTypes<FormatSchema>,
			TreeNodeFromImplicitAllowedTypes<TextAtomSchemas<ExtraAtomsSchema>>
		>[];

		/**
		 * Insert a range of characters into the string based on character index.
		 * @remarks
		 * See {@link (TreeArrayNode:interface).insertAt} for more details on the behavior.
		 * See {@link FormattedText.Statics.fromString} for how the `additionalCharacters` string is broken into characters.
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
			additionalCharacters: Iterable<
				FormattedAtomInsertable<
					InsertableTreeNodeFromImplicitAllowedTypes<FormatSchema>,
					InsertableTreeNodeFromImplicitAllowedTypes<TextAtomSchemas<ExtraAtomsSchema>>
				>
			>,
		): void;

		/**
		 * Apply formatting to a range of characters based on character index.
		 * @param startIndex - The starting index (inclusive) of the range to format.
		 * @param endIndex - The ending index (exclusive) of the range to format.
		 * @param format - The formatting to apply to the specified range.
		 * For each atom, every property of `format` will be cloned and assigned to the atom's format's corresponding subtree, overwriting any existing values for those properties.
		 * All enumerable own properties of `format` will be applied, including those with `undefined` values.
		 * @remarks
		 * The start and end behave the same as in {@link (TreeArrayNode:interface).removeRange}.
		 * This edits existing formatting subtrees on each atom, and only works when those atoms are object nodes.
		 *
		 * This is typically used to set some formatting property, like `bold` on a range of text without impacting other formatting properties.
		 * @privateRemarks
		 * This API is designed such that it can be optimized and improved in the future in a few different ways:
		 * 1. TODO: It can be optimized to use lower level APIs directly, bypassing the overhead of the public API surface.
		 * 2. TODO: A lower level editing API could be introduced and used to more efficiently express the edit (for example a bulk edit based on path, or a way to reuse the inserted content in multiple places instead of having to clone it before making the edit).
		 * 3. TODO: Optimize the encoding of such edits, either with a dedicated format for range edits like this and/or encoding optimizations that can compress such edits over ranges to O(1) space.
		 * 4. TODO: Preserve the range editing semantics through the whole stack to allow for better merge behavior, and make optimizations easier.
		 */
		formatRange(
			startIndex: number | undefined,
			endIndex: number | undefined,
			format: Partial<TreeNodeFromImplicitAllowedTypes<FormatSchema>>,
		): void;

		/**
		 * Replace formatting of a range of characters based on character index.
		 * @param startIndex - The starting index (inclusive) of the range to format.
		 * @param endIndex - The ending index (exclusive) of the range to format.
		 * @param format - The formatting to replace the formatting of the indicated range with.
		 * For each atom, `format` will be cloned and assigned to the atom's format, overwriting any existing formatting.
		 * If not specified the `defaultFormat` from {@link FormattedText.createSchema} will be used.
		 * @remarks
		 * The start and end behave the same as in {@link (TreeArrayNode:interface).removeRange}.
		 *
		 * This is typically used to normalize formatting, like resetting the formatting of a range to default settings.
		 * @privateRemarks
		 * See notes on {@link FormattedText.Members.formatRange} for future optimization opportunities.
		 */
		reformat(
			startIndex?: number | undefined,
			endIndex?: number | undefined,
			format?: InsertableTreeFieldFromImplicitField<FormatSchema>,
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
		 * @param callback - Called after each change with a sequence of {@link PlainText.TextOp}s describing what changed,
		 * or `undefined` when a delta could not be computed (e.g. during a schema upgrade).
		 * @returns A cleanup function that unsubscribes the callback when called.
		 * @remarks
		 * Unlike {@link PlainText.Members.onCharactersChanged} which only fires on
		 * shallow changes (inserts and removes), this method also fires on deep changes —
		 * formatting property updates on existing characters.
		 * The {@link PlainText.TextRetainOp.formattingChanged} flag on retain ops
		 * indicates which character ranges had formatting updates.
		 *
		 * All counts in the delivered ops are in Unicode code points, not UTF-16 code units.
		 * For characters outside the Basic Multilingual Plane (e.g. emoji), one code point
		 * corresponds to two UTF-16 code units — convert before using the counts as string indices.
		 */
		onContentChanged(
			callback: (ops: readonly PlainText.TextOp[] | undefined) => void,
		): () => void;
	}

	/**
	 * Insertable shape for a formatted text atom used by {@link FormattedText.Members.insertWithFormattingAt}.
	 * @input
	 * @alpha
	 */
	export interface FormattedAtomInsertable<TFormat, TContent> {
		readonly content: TContent;
		readonly format: TFormat;
	}

	/**
	 * Schema identifier for the a generic formatted text schema.
	 * @privateRemarks
	 * Eventually this should probably be given a better name and/or made a system type in a system namespace.
	 * @alpha
	 */
	export type FormattedTextSchemaIdentifier<TUserScope extends string> = ScopedSchemaName<
		`com.fluidframework.text.formatted<${TUserScope}>`,
		"Text"
	>;

	/**
	 * Helper for expressing the full set of text atoms for a given schema.
	 * @remarks
	 * This is just schema for the text atom {@link AllowedTypes},
	 * and does not include the actual formatting (which is higher up in the tree).
	 * @sealed
	 * @alpha
	 */
	export type TextAtomSchemas<
		ExtraAtomsSchema extends readonly LazyItem<
			TreeNodeSchema<string, NodeKind, TextAtom & TreeNode>
		>[],
	> = readonly [typeof StringTextAtom, ...ExtraAtomsSchema];

	/**
	 * A generic type for a formatted text schema.
	 * @sealed
	 * @alpha
	 */
	export type FormattedTextSchema<
		TUserScope extends string,
		FormatSchema extends ImplicitAllowedTypes,
		ExtraAtomsSchema extends readonly LazyItem<
			TreeNodeSchema<string, NodeKind, TextAtom & TreeNode>
		>[],
	> = Statics<
		ErasedNode<
			Members<FormatSchema, ExtraAtomsSchema>,
			FormattedTextSchemaIdentifier<TUserScope>
		>,
		FormatSchema
	> &
		ErasedSchemaSubclassable<
			Members<FormatSchema, ExtraAtomsSchema>,
			FormattedTextSchemaIdentifier<TUserScope>
		>;
}
