/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { EmptyKey } from "../core/index.js";
import {
	enumFromStrings,
	eraseSchemaDetails,
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeArrayNode,
	TreeBeta,
} from "../simple-tree/index.js";
import type {
	TreeNode,
	TreeNodeFromImplicitAllowedTypes,
	WithType,
} from "../simple-tree/index.js";
import { mapIterable } from "../util/index.js";
import { charactersFromString, type TextAsTree } from "./textDomain.js";

const sf = new SchemaFactoryAlpha("com.fluidframework.text.formatted");

class TextNode
	extends sf.object("Text", {
		content: SchemaFactory.required([() => StringArray], { key: EmptyKey }),
	})
	implements FormattedTextAsTree.Members
{
	public defaultFormat: CharacterFormat = new CharacterFormat(defaultFormat);

	public insertAt(index: number, additionalCharacters: string): void {
		this.content.insertAt(
			index,
			TreeArrayNode.spread(textAtomsFromString(additionalCharacters, this.defaultFormat)),
		);
	}
	public removeRange(index: number, length: number): void {
		this.content.removeRange(index, length);
	}
	public characters(): Iterable<string> {
		return mapIterable(this.content, (atom) => atom.content.content);
	}
	public fullString(): string {
		return this.content.join("");
	}

	public static fromString(value: string, format?: CharacterFormat): TextNode {
		// Constructing an ArrayNode from an iterator is supported, so creating an array from the iterable of characters seems like its not necessary here,
		// but to reduce the risk of incorrect data interpretation, we actually ban this in the special case where the iterable is a string directly, which is the case here.
		// Thus the array construction here is necessary to avoid a runtime error.
		return new TextNode({
			content: [...textAtomsFromString(value, format ?? new CharacterFormat(defaultFormat))],
		});
	}

	public charactersFormatted(): Iterable<StringAtom> {
		return this.content;
	}
	public insertFormattedAt(index: number, additionalCharacters: Iterable<StringAtom>): void {
		this.content.insertAt(index, TreeArrayNode.spread(additionalCharacters));
	}
	public formatRange(
		startIndex: number,
		length: number,
		format: Partial<CharacterFormat>,
	): void {
		for (let i = startIndex; i < startIndex + length; i++) {
			const atom = this.content[i];
			if (atom === undefined) {
				throw new UsageError("Index out of bounds while formatting text range.");
			}
			for (const [key, value] of Object.entries(format) as [
				keyof CharacterFormat,
				unknown,
			][]) {
				if (typeof key !== "string") {
					throw new UsageError(`Invalid format key: ${key.toString()}`);
				}
				const f = CharacterFormat.fields.get(key);
				if (f === undefined) {
					throw new UsageError(`Unknown format key: ${key}`);
				}
				// Ensures that if the input is a node, it is cloned before being inserted into the tree.
				atom.format[key] = TreeBeta.clone(TreeBeta.create(f, value as never)) as never;
			}
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

function textAtomsFromString(value: string, format: CharacterFormat): Iterable<StringAtom> {
	const result = mapIterable(
		charactersFromString(value),
		(char) =>
			new StringAtom({
				content: { content: char },
				format: TreeBeta.clone<typeof CharacterFormat>(format),
			}),
	);
	return result;
}

class CharacterFormat extends sf.objectAlpha("CharacterFormat", {
	bold: SchemaFactory.boolean,
	italic: SchemaFactory.boolean,
	underline: SchemaFactory.boolean,
	size: SchemaFactory.number,
	font: SchemaFactory.string,
}) {}

class StringTextAtom extends sf.object("StringTextAtom", {
	content: SchemaFactory.required([SchemaFactory.string], { key: EmptyKey }),
}) {}

const LineTag = enumFromStrings(sf.scopedFactory("lineTag"), [
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"li",
]);
type LineTag = TreeNodeFromImplicitAllowedTypes<typeof LineTag.schema>;

class StringLineAtom extends sf.object("StringLineAtom", {
	tag: LineTag.schema,
}) {
	public readonly content = "\n";
}

const StringAtomContent = [StringTextAtom, StringLineAtom] as const;
type StringAtomContent = TreeNodeFromImplicitAllowedTypes<typeof StringAtomContent>;

class StringAtom extends sf.object("StringTextAtom", {
	content: SchemaFactory.required(StringAtomContent, { key: EmptyKey }),
	format: CharacterFormat,
}) {}

class StringArray extends sf.array("StringArray", StringAtom) {}

/**
 * A collection of text related types, schema and utilities for working with text beyond the basic {@link SchemaStatics.string}.
 * @privateRemarks
 * This has hard coded assumptions about what kind of embedded content and what kind of formatting is supported.
 * We will want to generalize this with a more generic schema factory function like with table.
 * Then either that and/or the output from it can be package exported.
 * This version is just an initial prototype.
 * @internal
 */
export namespace FormattedTextAsTree {
	/**
	 * Statics for text nodes.
	 * @internal
	 */
	export interface Statics {
		/**
		 * Construct a {@link FormattedTextAsTree.(Tree:type)} from a string, where each character (as defined by iterating over the string) becomes a single character in the text node.
		 * This combines pairs of utf-16 surrogate code units into single characters as appropriate.
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
		 * Gets an iterable over the characters currently in the text.
		 * @remarks
		 * This iterator matches the behavior of {@link (TreeArrayNode:interface)} with respect to edits during iteration.
		 */
		charactersFormatted(): Iterable<StringAtom>;

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
		insertFormattedAt(index: number, additionalCharacters: Iterable<StringAtom>): void;

		/**
		 * Apply formatting to a range of characters based on character index.
		 * @param startIndex - The starting index of the range to format.
		 * @param length - The number of characters to format.
		 * @param format - The formatting to apply to the specified range.
		 */
		formatRange(startIndex: number, length: number, format: Partial<CharacterFormat>): void;
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
