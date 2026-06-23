/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { compareArrays, debugAssert } from "@fluidframework/core-utils/internal";
import {
	buildFunc,
	exposeMethodsSymbol,
	type ExposedMethods,
	type IExposedMethods,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/type-factory/alpha";
import { typeFactory as tf } from "@fluidframework/type-factory/internal";

import { EmptyKey, mapCursorField, type ITreeCursorSynchronous } from "../core/index.js";
import { TreeAlpha } from "../shared-tree/index.js";
import {
	eraseSchemaDetails,
	getInnerNode,
	incrementalSummaryHint,
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeArrayNode,
} from "../simple-tree/index.js";
import type {
	ArrayNodeDeltaOp,
	ArrayNodeTreeChangedDeltaOp,
	TreeNode,
	WithType,
	// eslint-disable-next-line import-x/no-duplicates
} from "../simple-tree/index.js";
// Add some unused imports which show up in the generated d.ts file.
// This prevents them from getting inline imports generated, cleaning up the d.ts file and API reports.
// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports, import-x/no-duplicates
import type { NodeKind, TreeNodeSchema } from "../simple-tree/index.js";

const sf = new SchemaFactoryAlpha("com.fluidframework.text");

class TextNode
	extends sf.object("Text", {
		content: SchemaFactory.required([() => StringArray], { key: EmptyKey }),
	})
	implements TextAsTree.Members, IExposedMethods
{
	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.exposeMethod(
			TextNode,
			"insertAt",
			buildFunc(
				{
					description:
						"Insert characters into the text at the given character index (Unicode code points).",
					returns: tf.void(),
				},
				["index", tf.number()],
				["additionalCharacters", tf.string()],
			),
		);
		methods.exposeMethod(
			TextNode,
			"removeRange",
			buildFunc(
				{
					description:
						"Remove a range of characters from the text by character index (Unicode code points). startIndex defaults to 0 and endIndex defaults to the length of the text.",
					returns: tf.void(),
				},
				["startIndex", tf.union([tf.number(), tf.undefined()])],
				["endIndex", tf.union([tf.number(), tf.undefined()])],
			),
		);
		methods.exposeMethod(
			TextNode,
			"fullString",
			buildFunc({
				description: "Return a copy of this text node's content as a string.",
				returns: tf.string(),
			}),
		);
		methods.exposeMethod(
			TextNode,
			"characterCount",
			buildFunc({
				description:
					"Gets the number of characters (Unicode code points) currently in the text. Joined emojis and other grapheme clusters count as multiple characters.",
				returns: tf.number(),
			}),
		);
		methods.exposeMethod(
			TextNode,
			"charactersCopy",
			buildFunc({
				description:
					"Returns all characters in the text as an array, where each element is a single Unicode code point. Joined emojis and other grapheme clusters are split into separate elements.",
				returns: tf.array(tf.string()),
			}),
		);
	}

	public [exposeMethodsSymbol](methods: ExposedMethods): void {
		TextNode[exposeMethodsSymbol](methods);
	}

	public insertAt(index: number, additionalCharacters: string): void {
		this.content.insertAt(
			index,
			TreeArrayNode.spread(charactersFromString(additionalCharacters)),
		);
	}
	public removeRange(index: number | undefined, end: number | undefined): void {
		this.content.removeRange(index, end);
	}
	public characters(): Iterable<string> {
		return this.content[Symbol.iterator]();
	}

	public characterCount(): number {
		return this.content.length;
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

	public fullString(): string {
		const result = this.content.fullString();
		debugAssert(
			() => result === this.fullString_reference() || "invalid fullString optimizations",
		);
		return result;
	}

	/**
	 * Unoptimized trivially correct implementation of fullString.
	 */
	public fullString_reference(): string {
		return this.content.join("");
	}

	/**
	 * Unoptimized trivially correct implementation of charactersCopy.
	 */
	public charactersCopy_reference(): string[] {
		return [...this.content];
	}

	public onCharactersChanged(
		callback: (ops: readonly TextAsTree.TextOp[] | undefined) => void,
	): () => void {
		return TreeAlpha.on(this.content, "nodeChanged", ({ delta }) =>
			processCharactersChangedDelta(delta, (i) => this.content[i], callback),
		);
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
export function charactersFromString(value: string): Iterable<string> {
	// Uses the string as an iterable of characters, so utf-16 surrogate pairs get grouped together correctly.
	// Might be nice to call isWellFormed or toWellFormed here (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toWellFormed)
	// But those are not widely supported yet.
	return value;
}

class StringArray extends sf.arrayAlpha(
	"StringArray",
	// Opt the character content into incremental summary optimization.
	sf.types([SchemaFactory.string], {
		custom: { [incrementalSummaryHint]: true },
	}),
) {
	public withBorrowedSequenceCursor<T>(f: (cursor: ITreeCursorSynchronous) => T): T {
		const cursor = getInnerNode(this).borrowCursor();
		cursor.enterField(EmptyKey);
		const result = f(cursor);
		cursor.exitField();
		return result;
	}

	public charactersCopy(): string[] {
		return this.withBorrowedSequenceCursor((cursor) =>
			mapCursorField(cursor, () => cursor.value as string),
		);
	}

	public fullString(): string {
		return this.charactersCopy().join("");
	}
}

/**
 * Processes an array-node delta into a {@link TextAsTree.TextOp}[] and calls `callback`.
 * @remarks
 * Shared by both the plain `onCharactersChanged` (from `nodeChanged`) and formatted `onContentChanged`
 * (from `treeChanged`) implementations.
 * @param delta - The raw array-node delta, or `undefined` when no delta is available.
 * When retain ops carry `subtreeChanged` (i.e. delta comes from a `treeChanged` event), the emitted
 * retain ops include an explicit `formattingChanged: boolean`. Otherwise `formattingChanged` is omitted.
 * @param getCharacter - Returns the character string at the given array index in the **post-edit** tree.
 * Only invoked for insert ops, where it must read the inserted character at the given index of the tree
 * after the edit has been applied. Passing an accessor that reads pre-edit content will silently produce wrong text.
 * Return `undefined` if the tree is out of sync with the delta; this triggers a full-reread fallback.
 * @param callback - The user-supplied callback to invoke with the translated ops.
 */
export function processCharactersChangedDelta(
	delta: readonly (ArrayNodeDeltaOp | ArrayNodeTreeChangedDeltaOp)[] | undefined,
	getCharacter: (index: number) => string | undefined,
	callback: (ops: readonly TextAsTree.TextOp[] | undefined) => void,
): void {
	if (delta === undefined) {
		callback(undefined);
		return;
	}
	let readPosition = 0;
	const ops: TextAsTree.TextOp[] = [];
	for (const op of delta) {
		if (op.type === "retain") {
			// `subtreeChanged` is only present on retain ops from `treeChanged` deltas.
			ops.push(
				"subtreeChanged" in op
					? { type: "retain", count: op.count, formattingChanged: op.subtreeChanged === true }
					: { type: "retain", count: op.count },
			);
			readPosition += op.count;
		} else if (op.type === "insert") {
			// Accumulate into an array and join at the end to keep this O(n) for large inserts
			// (paste of long text) instead of O(n^2) from repeated string concatenation.
			const characters: string[] = [];
			for (let i = 0; i < op.count; i++) {
				const character = getCharacter(readPosition);
				if (character === undefined) {
					// Tree is out of sync with the delta — fall back to full re-read.
					callback(undefined);
					return;
				}
				characters.push(character);
				readPosition++;
			}
			ops.push({ type: "insert", text: characters.join("") });
		} else {
			// Construct explicit remove op so internal fields on the source op don't leak.
			ops.push({ type: "remove", count: op.count });
		}
	}
	callback(ops);
}

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
 * @alpha
 */
export namespace TextAsTree {
	/**
	 * A retain op in a character-level delta — a span of unchanged characters that the consumer should skip over.
	 * @sealed
	 * @alpha
	 */
	export interface TextRetainOp {
		/**
		 * Discriminator identifying this op as a retain.
		 */
		readonly type: "retain";
		/**
		 * The number of Unicode code points to retain.
		 */
		readonly count: number;
		/**
		 * Whether at least one character in the retained range had a deep change.
		 * @remarks
		 * Present only on retain ops delivered by {@link @fluidframework/tree#FormattedTextAsTree.Members.onContentChanged};
		 * always absent on retain ops delivered by {@link TextAsTree.Members.onCharactersChanged}.
		 * When present, `true` indicates the retained range contained a formatting property update
		 * or an atom content edit; `false` indicates no deep change.
		 */
		readonly formattingChanged?: boolean;
	}

	/**
	 * An insert op in a character-level delta — characters newly added to the text.
	 * @remarks
	 * Carries the inserted text as a single string, which is more convenient for consumers than individual characters.
	 * @sealed
	 * @alpha
	 */
	export interface TextInsertOp {
		/**
		 * Discriminator identifying this op as an insert.
		 */
		readonly type: "insert";
		/**
		 * The newly inserted characters, concatenated into a single string.
		 */
		readonly text: string;
	}

	/**
	 * A remove op in a character-level delta — a span of characters that has been deleted from the text.
	 * @sealed
	 * @alpha
	 */
	export interface TextRemoveOp {
		/**
		 * Discriminator identifying this op as a remove.
		 */
		readonly type: "remove";
		/**
		 * The number of Unicode code points removed.
		 */
		readonly count: number;
	}

	/**
	 * A single operation in a character-level delta describing an insert, remove, or retain of text.
	 * @alpha
	 */
	export type TextOp = TextRetainOp | TextInsertOp | TextRemoveOp;

	/**
	 * Statics for text nodes.
	 * @alpha
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
	 * @sealed
	 * @alpha
	 */
	export interface Members {
		/**
		 * Gets an iterable over the characters currently in the text.
		 * @remarks
		 * This iterator matches the behavior of {@link (TreeArrayNode:interface)} with respect to edits during iteration.
		 */
		characters(): Iterable<string>;

		/**
		 * Optimized way to get a copy of the {@link TextAsTree.Members.characters} in an array.
		 */
		charactersCopy(): string[];

		/**
		 * Gets the number of characters currently in the text.
		 * @remarks
		 * The length of {@link TextAsTree.Members.characters}.
		 * This is not the length of the string returned by {@link TextAsTree.Members.fullString},
		 * as that string may contain characters which are made up of multiple UTF-16 code units.
		 */
		characterCount(): number;

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
		removeRange(startIndex: number | undefined, endIndex: number | undefined): void;

		/**
		 * Subscribe to shallow character-level changes on this text node — inserts and removes only.
		 * @param callback - Called after each change with a sequence of {@link TextAsTree.TextOp}s describing what changed,
		 * or `undefined` when a delta could not be computed (e.g. during a schema upgrade).
		 * @returns A cleanup function that unsubscribes the callback when called.
		 * @remarks
		 * Only fires on shallow changes — inserts and removes.
		 * It does not fire on deep changes such as formatting property updates on existing characters.
		 * For formatted text, use {@link @fluidframework/tree#FormattedTextAsTree.Members.onContentChanged} to also receive deep changes.
		 *
		 * All counts in the delivered ops are in Unicode code points, not UTF-16 code units.
		 * For characters outside the Basic Multilingual Plane (e.g. emoji), one code point
		 * corresponds to two UTF-16 code units — convert before using the counts as string indices.
		 */
		onCharactersChanged(callback: (ops: readonly TextOp[] | undefined) => void): () => void;
	}

	/**
	 * Schema for a {@link TextAsTree.(Tree:variable)} node.
	 * @remarks
	 * See {@link TextAsTree.Statics} for static APIs on this schema, including construction.
	 * @alpha
	 */
	export const Tree = eraseSchemaDetails<Members, Statics>()(TextNode);

	/**
	 * Node for the {@link TextAsTree.(Tree:type)} schema exposing the {@link TextAsTree.Members} API.
	 * @remarks
	 * Create using {@link TextAsTree.Statics.fromString}.
	 * @alpha
	 */
	export type Tree = Members & TreeNode & WithType<"com.fluidframework.text.Text">;
}
