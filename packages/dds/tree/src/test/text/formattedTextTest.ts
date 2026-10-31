/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { enumFromStrings, SchemaFactory, SchemaFactoryBeta } from "../../simple-tree/index.js";
import { FormattedText } from "../../text/index.js";

const sf = new SchemaFactoryBeta("test.FormattedTextTest");

/**
 * A minimal parameterization of the generic {@link FormattedText} schema.
 * The tests use it to test {@link FormattedText}.
 * @remarks
 * The "formattedText-test" schema compatibility snapshots find changes to its stored schema.
 */
export namespace FormattedTextTest {
	/**
	 * Formatting options for characters.
	 */
	export class CharacterFormat extends sf.object("CharacterFormat", {
		bold: SchemaFactory.boolean,
		size: SchemaFactory.number,
		font: SchemaFactory.string,
	}) {}

	/**
	 * Tag with which a line in text can be formatted.
	 */
	export const LineTag = enumFromStrings(sf.createDerivedFactory(undefined, "lineTag"), [
		"h1",
		"h2",
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
		size: 12,
		font: "Arial",
	}) {}
}
