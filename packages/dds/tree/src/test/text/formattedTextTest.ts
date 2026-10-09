/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { enumFromStrings, SchemaFactory, SchemaFactoryBeta } from "../../simple-tree/index.js";
import { FormattedText } from "../../text/index.js";

const sf = new SchemaFactoryBeta("test.FormattedTextTest");

/**
 * Example parameterization of the generic {@link FormattedText}, used to test it.
 * @remarks
 * This mirrors the shape of `FormattedTextDefault` from `@fluidframework/quill-react`, but uses its own scope.
 * Changes to its stored schema are caught by the "formattedText-test" schema compatibility snapshots.
 */
export namespace FormattedTextTest {
	/**
	 * Formatting options for characters.
	 */
	export class CharacterFormat extends sf.object("CharacterFormat", {
		bold: SchemaFactory.boolean,
		italic: SchemaFactory.boolean,
		underline: SchemaFactory.boolean,
		size: SchemaFactory.number,
		font: SchemaFactory.string,
	}) {}

	/**
	 * Tag with which a line in text can be formatted.
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
	 * Newline atom which carries formatting for the line it ends.
	 */
	export class StringLineAtom extends sf.object("StringLineAtom", {
		tag: LineTag.schema,
		indent: SchemaFactory.number,
	}) {
		public readonly content = "\n";
	}

	/**
	 * Formatted text schema supporting {@link FormattedTextTest.CharacterFormat} and {@link FormattedTextTest.StringLineAtom}.
	 */
	export class Tree extends FormattedText.createSchema(sf, CharacterFormat, [StringLineAtom], {
		bold: false,
		italic: false,
		underline: false,
		size: 12,
		font: "Arial",
	}) {}
}
