/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	enumFromStrings,
	FormattedText,
	SchemaFactory,
	SchemaFactoryBeta,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
} from "@fluidframework/tree/alpha";

/**
 * Schema factory for the formatted text types used by {@link FormattedMainView}.
 * @remarks
 * This scope is part of the persisted schema identifiers, so it must not change.
 */
const sf = new SchemaFactoryBeta("com.fluidframework.text.formatted.default");

const defaultFormat = {
	bold: false,
	italic: false,
	underline: false,
	size: 12,
	font: "Arial",
} as const;

/**
 * A parameterization of the generic {@link @fluidframework/tree#FormattedText} with the formatting and line types that {@link FormattedMainView} supports.
 * @remarks
 * The character formatting and line tags mirror the subset of Quill attributes that the editor maps into the tree.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-namespace -- Namespace groups the schema, matching the tree text domains.
export namespace FormattedTextDefault {
	/**
	 * Portion of a string with formatting.
	 * @sealed
	 * @internal
	 */
	export type FormattedAtom = FormattedText.FormattedAtom<CharacterFormat, StringAtomContent>;

	/**
	 * Formatting options for characters.
	 * @sealed
	 * @internal
	 */
	export class CharacterFormat extends sf.object("CharacterFormat", {
		bold: SchemaFactory.boolean,
		italic: SchemaFactory.boolean,
		underline: SchemaFactory.boolean,
		size: SchemaFactory.number,
		font: SchemaFactory.string,
	}) {
		public static readonly defaultFormat = new CharacterFormat(defaultFormat);
	}

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
		"ol",
		"checked",
		"unchecked",
		"blockquote",
		"codeBlock",
	]);
	/**
	 * {@inheritdoc FormattedTextDefault.(LineTag:variable)}
	 * @sealed
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
	 * @sealed
	 * @internal
	 */
	export class StringLineAtom extends sf.object("StringLineAtom", {
		tag: LineTag.schema,
		indent: SchemaFactory.number,
	}) {
		public readonly content = "\n";
	}

	/**
	 * Types of "atoms" that make up the text.
	 * @sealed
	 * @internal
	 */
	export const StringAtomContent = [FormattedText.StringTextAtom, StringLineAtom] as const;
	/**
	 * {@inheritdoc FormattedTextDefault.(StringAtomContent:variable)}
	 * @sealed
	 * @internal
	 */
	export type StringAtomContent = TreeNodeFromImplicitAllowedTypes<typeof StringAtomContent>;

	/**
	 * Statics for text nodes.
	 * @sealed
	 * @internal
	 */
	export type Statics<TTree = Tree> = FormattedText.Statics<TTree, typeof CharacterFormat>;

	/**
	 * Insertable shape for a formatted text atom used by {@link @fluidframework/tree#FormattedText.Members.insertWithFormattingAt}.
	 * @sealed
	 * @internal
	 */
	export type FormattedAtomInsertable = FormattedText.FormattedAtom<
		InsertableTreeNodeFromImplicitAllowedTypes<typeof CharacterFormat>,
		InsertableTreeNodeFromImplicitAllowedTypes<TextAtomSchemas>
	>;

	/**
	 * Helper for expressing the full set of formatted text atoms for a given schema.
	 * @privateRemarks
	 * Eventually this should probably be given a better name and/or made a system type in a system namespace.
	 * @sealed
	 * @internal
	 */
	export type TextAtomSchemas = FormattedText.TextAtomSchemas<[typeof StringLineAtom]>;

	/**
	 * The schema produced using {@link @fluidframework/tree#FormattedText.createSchema} with hard-coded assumptions
	 * about what kind of embedded content and what kind of formatting is supported.
	 * @sealed
	 * @internal
	 */
	export class Tree extends FormattedText.createSchema(
		sf,
		CharacterFormat,
		[StringLineAtom],
		defaultFormat,
	) {}
}
