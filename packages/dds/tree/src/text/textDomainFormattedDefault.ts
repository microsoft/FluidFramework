/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	enumFromStrings,
	SchemaFactory,
	SchemaFactoryAlpha,
	SchemaFactoryBeta,
} from "../simple-tree/index.js";
import type {
	TreeNodeFromImplicitAllowedTypes,
	InsertableTreeNodeFromImplicitAllowedTypes,
} from "../simple-tree/index.js";

import { FormattedTextAsTree } from "./textDomainFormatted.js";

/**
 * Schema factory for default formatted text types which are not generic.
 */
const sf = new SchemaFactoryAlpha("com.fluidframework.text.formatted.default");

const defaultFormat = {
	bold: false,
	italic: false,
	underline: false,
	size: 12,
	font: "Arial",
} as const;

/**
 * A collection of text related types, schema and utilities for working with text beyond the basic {@link SchemaStatics.string}.
 * @remarks
 * This is a default parameterization of the generic {@link FormattedTextAsTree} with hard-coded assumptions about what kind of embedded content and what kind of formatting is supported.
 * It is unlikely this meeds the needs of most users, but it can serve as an unstable example of how to use the generic {@link FormattedTextAsTree}.
 * @internal
 */
export namespace FormattedTextAsTreeDefault {
	/**
	 * Portion of a string with formatting.
	 * @sealed
	 * @internal
	 */
	export type FormattedAtom = FormattedTextAsTree.FormattedAtom<
		CharacterFormat,
		StringAtomContent
	>;

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
	 * {@inheritdoc FormattedTextAsTreeDefault.(LineTag:variable)}
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
	export class StringLineAtom extends sf.object("StringLineAtom", {
		tag: LineTag.schema,
		indent: SchemaFactory.number,
	}) {
		public readonly content = "\n";
	}

	/**
	 * Types of "atoms" that make up the text.
	 * @internal
	 */
	export const StringAtomContent = [
		FormattedTextAsTree.StringTextAtom,
		StringLineAtom,
	] as const;
	/**
	 * {@inheritdoc FormattedTextAsTreeDefault.(StringAtomContent:variable)}
	 * @internal
	 */
	export type StringAtomContent = TreeNodeFromImplicitAllowedTypes<typeof StringAtomContent>;

	/**
	 * Statics for text nodes.
	 * @internal
	 */
	export type Statics<TTree = Tree> = FormattedTextAsTree.Statics<TTree>;

	/**
	 * Insertable shape for a formatted text atom used by {@link FormattedTextAsTree.Members.insertWithFormattingAt}.
	 * @internal
	 */
	export type FormattedAtomInsertable = FormattedTextAsTree.FormattedAtom<
		InsertableTreeNodeFromImplicitAllowedTypes<typeof CharacterFormat>,
		InsertableTreeNodeFromImplicitAllowedTypes<FormattedTextAtoms>
	>;

	/**
	 * Helper for expressing the full set of formatted text atoms for a given schema.
	 * @privateRemarks
	 * Eventually this should probably be given a better name and/or made a system type in a system namespace.
	 * @internal
	 */
	export type FormattedTextAtoms = FormattedTextAsTree.FormattedTextAtoms<
		[typeof StringLineAtom]
	>;

	export class Tree extends FormattedTextAsTree.createSchema(
		new SchemaFactoryBeta("default"),
		CharacterFormat,
		[StringLineAtom],
		defaultFormat,
	) {}
}
