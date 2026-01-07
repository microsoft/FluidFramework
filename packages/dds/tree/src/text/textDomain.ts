/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EmptyKey } from "../core/index.js";
import {
	eraseSchemaDetails,
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeArrayNode,
} from "../simple-tree/index.js";
import type { TreeNode, WithType } from "../simple-tree/index.js";

const sf = new SchemaFactoryAlpha("com.fluidframework.text");

class TextNode
	extends sf.object("Text", {
		content: SchemaFactory.required([() => StringArray], { key: EmptyKey }),
	})
	implements TextAsTree.Members
{
	public insertAt(index: number, additionalCharacters: string): void {
		this.content.insertAt(
			index,
			TreeArrayNode.spread(charactersFromString(additionalCharacters)),
		);
	}
	public removeRange(index: number, length: number): void {
		this.content.removeRange(index, length);
	}
	public characters(): Iterable<string> {
		return this.content[Symbol.iterator]();
	}
	public fullString(): string {
		return this.content.join("");
	}

	public static fromString(value: string): TextNode {
		// Constructing an ArrayNode from an iterator is supported, so creating an array from the iterable of characters seems like its not necessary here,
		// but to reduce the risk of incorrect data interpretation, we actually ban this in the special case where the iterable is a string directly, which is the case here.
		// Thus the array construction here is necessary to avoid a runtime error.
		return new TextNode({ content: [...charactersFromString(value)] });
	}
}

/**
 * Interpret a string as an iterable of characters.
 * @remarks
 * This mostly exists to clearly document where the code is interpreting a string as characters,
 * and provide a centralized place where validation could be added in the future if desired.
 * Additionally using this function consistently will make any refactors to support alternative character boundaries easier.
 */
function charactersFromString(value: string): Iterable<string> {
	// Uses the string as an iterable of characters, so utf-16 surrogate pairs get grouped together correctly.
	// Might be nice to call isWellFormed or toWellFormed here (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toWellFormed)
	// But those are not widely supported yet.
	return value;
}

class StringArray extends sf.array("StringArray", SchemaFactory.string) {}

/**
 * A collection of text related types, schema and utilities for working with text beyond the basic {@link SchemaStatics.string}.
 * @privateRemarks
 * Currently this API only supports a really minimal feature set, and has no support for more advanced features like:
 * - Alternative character boundaries (e.g. grapheme clusters, paragraphs, tokens, etc.).
 * We may want to provide either ways to create strings with application controlled character boundaries since there is not a clear single answer on how to break a string into atomic units.
 * - Character attributes (e.g. bold, italic, etc):
 * Properties that can be set on any character independently with optimizations for runs of characters with the same attributes.
 * - Inline objects (e.g. images, embedded components, etc):
 * These would be logically part of the text, generalizing characters to allow inline objects in character ranges.
 * How character attributes apply to inline objects is an open question
 * (there could be a kind of object which gets them, and one that doesn't for example).
 * - Annotations (e.g. comments, suggestions, etc).
 * Objects which can be associated with a range of characters but are not logically part of the text.
 * These would need to have the logical range they apply to updated by edits.
 * How edits which overlap annotation boundaries are handled may require hints from the application for optimal behavior (mainly inserts at the boundaries).
 * These get a lifetime tied to the text node, not any of the characters the annotation covers,
 * however it might be desirable to have a way for a range edit to (optionally) also remove any annotations which are fully covered by the edit.
 * Annotations over an empty range should also be supported and behave well (for example not end up with characters inside the range after edits unless specifically structured so that makes sense).
 * - Anchors (e.g. positions in the text which survive edits).
 * These would be useful for ephemeral state like cursor positions, but should match the behaviors with respect to edits exhibited by the ends of Annotations.
 *
 * How these features will be represented in the schema and API should be determined before any of this is stabilized so the simple more limited version can neatly fit into the larger design.
 *
 * There are various optimizations that should be implemented to make this performant for large texts and common usage patterns.
 * These include:
 * - Optimized persisted format.
 * - Optimized in memory representation (via chunked forest).
 * - Optimized edit persisted format (e.g. combining adjacent inserts/removes into single operations as well as support for efficient attribute editing of ranges).
 * - Optimized edit application (e.g. applying the above noted optimizable edit cases efficiently).
 * This applies to the revision manager, the forest, and any flex or simple-tree nodes and user events.
 *
 * There are also additional features required for ensuring the invariants of collaborative text editing are maintained through concurrent edits.
 * The main challenges here are related to annotations, but some policies for what to do in the case of corrupt/invalid text should also be included.
 * There are quite a few ways invariants could break, including:
 * - concurrent edits without proper constraints.
 * - collaboration with clients using compatible schema with different constraints.
 * - opening documents which contain invalid content (e.g. from older versions of the software, manual edits to the persisted format, or simply an existing corrupt case which was saved).
 * - a user inserting/constructing/importing invalid content.
 *
 * These cases could break constraints causing issues like invalided characters (empty, a utf-16 surrogate pair alone, etc) or
 * annotations which reference out of bounds character ranges.
 * Addressing these issues mainly falls into these categories:
 * - Handling of invalid content on import/construction of unhydrated nodes and/or insertion into the document (hydration).
 * - Handling of invalid content which is already part of the document (live). This should ideally include both detection and repair.
 * - Constraints on edits to prevent invalid content from being created by merges.
 * - Optimization of the constraints to reduce cases in which edits are rejected due to conflicts.
 *
 * Note that these cases of invariant violations are the same cases any component should handle, so ideally there would be a general framework or pattern for documenting and enforcing such constraints.
 *
 * Another area for future work is improved APIs for import, export and non-schema-aware use. This includes a variety of cases, including but not limited to:
 * - Insertable content format (taken by the constructor and import APIs).
 * - Customizable export formats (like a way to make exportVerbose and exportConcise flatten the text nodes to strings automatically).
 * - Customizable toJson behavior (e.g. flattening to strings, possibly via tools or patterns for custom tree stringifier).
 * - Ensure JS object APIs (like iteration, own vs inherited properties, etc) provide a good and consistent experience with respect to other nodes.
 * - Support in generateSchemaFromSimpleSchema for recognizing text nodes and generating the appropriate schema.
 * - Ensure above features work well enough to support important scenarios like AI assisted editing and document indexing for search.
 *
 * Part of that work will be establishing and documenting those patterns so other components with complex encodings can follow them,
 * in addition to implementing them for text.
 * @internal
 */
export namespace TextAsTree {
	/**
	 * Statics for text nodes.
	 * @internal
	 */
	export interface Statics {
		/**
		 * Construct a {@link TextAsTree.(Tree:type)} from a string, where each character (as defined by iterating over the string) becomes a single character in the text node.
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
	 * @see {@link TextAsTree.Statics.fromString} for construction.
	 * @see {@link TextAsTree.(Tree:type)} for schema.
	 * @internal
	 */
	export interface Members {
		/**
		 * Gets an iterable over the characters currently in the text.
		 * @remarks
		 * This iterator matches the behavior of {@link (TreeArrayNode:interface)} with respect to edits during iteration.
		 */
		characters(): Iterable<string>;

		/**
		 * Copy the content of this node into a string.
		 */
		fullString(): string;

		/**
		 * Insert a range of characters into the string based on character index.
		 * @remarks
		 * See {@link (TreeArrayNode:interface).insertAt} for more details on the behavior.
		 * See {@link TextAsTree.Statics.fromString} for how the `additionalCharacters` string is broken into characters.
		 * @privateRemarks
		 * If we provide ways to customize character boundaries, that could be handled here by taking in an Iterable<string> instead of a string.
		 * Doing this currently would enable insertion of text with different character boundaries than the existing text,
		 * which would violate the currently documented character boundary invariants.
		 *
		 * Another option would be to take an approach like Table,
		 * where the user of the API uses a factory function to generate the schema, and can inject custom logic, like a string character iterator.
		 */
		insertAt(index: number, additionalCharacters: string): void;

		/**
		 * Remove a range from a string based on character index.
		 * See {@link (TreeArrayNode:interface).removeRange} for more details on the behavior.
		 */
		removeRange(index: number, length: number): void;
	}

	/**
	 * Schema for a text node.
	 * @remarks
	 * See {@link TextAsTree.Members} for the API.
	 * See {@link TextAsTree.Statics} for static APIs on this Schema, including construction.
	 * @internal
	 */
	export const Tree = eraseSchemaDetails<Members, Statics>()(TextNode);
	export type Tree = Members & TreeNode & WithType<"com.fluidframework.text.Text">;
}
