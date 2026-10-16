/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EmptyKey } from "../core/index.js";
import {
	createCustomizedFluidFrameworkScopedFactory,
	eraseSchemaDetailsSubclassable,
	SchemaFactory,
	type ErasedNode,
	type ErasedSchemaSubclassable,
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type ReadonlyArrayNode,
	type SchemaFactoryBeta,
	type ScopedSchemaName,
	type TreeNodeFromImplicitAllowedTypes,
	type TreeArrayNode,
} from "../simple-tree/index.js";

import { ExtrinsicRangeTracker } from "./extrinsicRangeTracker.js";
import type { RangeCollection } from "./rangeCollection.js";

/**
 * Schema and APIs for an array with separately stored ranges.
 * @remarks
 * A range stores two indexes into the content array and application-defined data.
 * Edit the array through {@link ArrayWithExtrinsicRanges.Members} to keep these indexes consistent.
 * Removing all content covered by a range collapses it to an empty range rather than deleting it.
 *
 * Structural content edits, range creation/removal, and bound changes use a document-wide {@link NoChangeConstraint}.
 * Range data edits use ordinary tree editing semantics without adding this constraint.
 * Configure SharedTree with `minVersionForCollab` of at least `2.80.0`.
 * Concurrent changes anywhere in the document can cause the entire edit to be rejected.
 * Applications must account for this asynchronous rejection, for example by observing commit outcomes.
 * Reverts also require the document to be unchanged since the edit, to avoid restoring stale indexes.
 *
 * This is an early implementation, not native support for persistent locations.
 * All writers must use these APIs: editing the underlying stored fields through another view schema,
 * import APIs, or an agent that bypasses these methods can violate the range invariants.
 * @alpha
 */
export namespace ArrayWithExtrinsicRanges {
	/**
	 * Creates a subclassable schema for an array with extrinsic ranges.
	 * @param inputSchemaFactory - Factory whose scope distinguishes this schema from other parameterizations.
	 * Keep the scope and parameter schemas stable when opening existing documents.
	 * @param rangeDataSchema - Schema for the data associated with each range.
	 * @param contentSchema - Schema for the items in the content array.
	 * @returns A schema with {@link ArrayWithExtrinsicRanges.Statics} for construction and
	 * {@link ArrayWithExtrinsicRanges.Members} for reading and editing.
	 * @remarks
	 * Generated identifiers use the scope `com.fluidframework.extrinsicRanges<user-scope>`.
	 * Use a different factory scope for each distinct parameterization in a document.
	 * Subclasses must not replace the `content`, `rangeStorage`, or `ranges` members.
	 * @alpha
	 */
	export function createSchema<
		const TUserScope extends string,
		const TRangeDataSchema extends ImplicitAllowedTypes,
		const TContentSchema extends ImplicitAllowedTypes,
	>(
		inputSchemaFactory: SchemaFactoryBeta<TUserScope>,
		rangeDataSchema: TRangeDataSchema,
		contentSchema: TContentSchema,
	): Schema<TUserScope, TRangeDataSchema, TContentSchema> {
		const sf = createCustomizedFluidFrameworkScopedFactory(
			inputSchemaFactory,
			"extrinsicRanges",
		);
		type ContentInsertable = [TContentSchema] extends [ImplicitAllowedTypes]
			? InsertableTreeNodeFromImplicitAllowedTypes<TContentSchema>
			: InsertableTreeNodeFromImplicitAllowedTypes<ImplicitAllowedTypes>;
		type Tracker = ExtrinsicRangeTracker<
			Content,
			ExtrinsicRange,
			InsertableTreeNodeFromImplicitAllowedTypes<TRangeDataSchema>
		>;

		class Manager
			extends sf.object("Manager", {
				content: SchemaFactory.required([() => Content], { key: EmptyKey }),
				rangeStorage: SchemaFactory.required([() => Ranges], { key: "ranges" }),
			})
			implements Members<TRangeDataSchema, TContentSchema>
		{
			#tracker: Tracker | undefined;

			public static create(content: Iterable<ContentInsertable> = []): Manager {
				return new this({ content: [...content], rangeStorage: {} });
			}

			public transactOnContent(edit: (content: TreeArrayNode<TContentSchema>) => void): void {
				this.#getTracker().transactOnContent(edit);
			}

			public get ranges(): RangeCollection<
				TreeNodeFromImplicitAllowedTypes<TRangeDataSchema>,
				InsertableTreeNodeFromImplicitAllowedTypes<TRangeDataSchema>
			> {
				return this.#getTracker();
			}

			#getTracker(): Tracker {
				return (this.#tracker ??= new ExtrinsicRangeTracker<
					Content,
					ExtrinsicRange,
					InsertableTreeNodeFromImplicitAllowedTypes<TRangeDataSchema>
				>(
					this.content,
					() => this.rangeStorage,
					() => this.rangeStorage,
					(start, end, data) => new ExtrinsicRange({ start, end, data }),
				));
			}
		}

		class Content extends sf.array("Content", contentSchema) {}
		class Ranges extends sf.map("Ranges", [() => ExtrinsicRange]) {}
		class ExtrinsicRange extends sf.object("Range", {
			data: SchemaFactory.required(rangeDataSchema),
			start: SchemaFactory.number,
			end: SchemaFactory.number,
		}) {}

		type Node = ErasedNode<
			Members<TRangeDataSchema, TContentSchema>,
			SchemaIdentifier<TUserScope>
		>;
		return eraseSchemaDetailsSubclassable<
			Members<TRangeDataSchema, TContentSchema>,
			Statics<Node, TContentSchema>
		>()(Manager);
	}

	/**
	 * Reading and editing APIs for an array with extrinsic ranges.
	 * @remarks
	 * Edit content synchronously with {@link ArrayWithExtrinsicRanges.Members.transactOnContent}.
	 * Content items and range data that are object nodes can still be edited directly.
	 * Such edits do not change array positions.
	 * @sealed
	 * @alpha
	 */
	export interface Members<
		TRangeDataSchema extends ImplicitAllowedTypes,
		TContentSchema extends ImplicitAllowedTypes,
	> {
		/**
		 * Live, read-only view of the content array.
		 */
		readonly content: ReadonlyArrayNode<
			[TContentSchema] extends [ImplicitAllowedTypes]
				? TreeNodeFromImplicitAllowedTypes<TContentSchema>
				: TreeNodeFromImplicitAllowedTypes<ImplicitAllowedTypes>
		>;
		/**
		 * Live collection for reading and editing extrinsic ranges.
		 */
		readonly ranges: RangeCollection<
			TreeNodeFromImplicitAllowedTypes<TRangeDataSchema>,
			InsertableTreeNodeFromImplicitAllowedTypes<TRangeDataSchema>
		>;
		/**
		 * Edits the content array and persists the resulting range endpoints in the same transaction.
		 * @param edit - Synchronous callback with mutable access to the content array.
		 * @remarks
		 * Content edits and their events occur normally during the callback.
		 * Range positions returned by {@link RangeCollection.getRange}
		 * track those edits using temporary array insertion anchors.
		 * The underlying stored endpoint fields are not synchronized until the callback finishes.
		 * Do not retain the mutable array for editing after the callback returns.
		 *
		 * Methods on this manager's range collection can be used inside the callback.
		 * Calls on the same manager cannot be nested.
		 * For moves between managed arrays, nest the two managers' callbacks so both arrays
		 * are edited only while their respective callbacks are active.
		 * Ranges remain with their manager rather than following moved content.
		 *
		 * Temporary anchors are disposed even if the callback throws.
		 * On hydrated nodes, errors have the same effect as errors in {@link UntypedTreeViewAlpha.(runTransaction:2)}.
		 * On unhydrated nodes, edits cannot roll back: completed edits and their endpoint updates remain.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if called recursively on the same
		 * manager or if the callback returns a promise.
		 */
		transactOnContent(edit: (content: TreeArrayNode<TContentSchema>) => void): void;
	}

	/**
	 * Construction API for an array with extrinsic ranges.
	 * @sealed
	 * @alpha
	 */
	export interface Statics<TNode, TContentSchema extends ImplicitAllowedTypes> {
		/**
		 * Creates an array with no ranges.
		 * @param content - Initial content. Defaults to an empty array.
		 * @returns A new, unhydrated node of this schema.
		 * @remarks
		 * Use {@link RangeCollection.trackNewRange} to add ranges after construction.
		 */
		create(
			content?: Iterable<InsertableTreeNodeFromImplicitAllowedTypes<TContentSchema>>,
		): TNode;
	}

	/**
	 * Identifier of a generated array-with-ranges schema.
	 * @alpha
	 */
	export type SchemaIdentifier<TUserScope extends string> = ScopedSchemaName<
		`com.fluidframework.extrinsicRanges<${TUserScope}>`,
		"Manager"
	>;

	/**
	 * An erased, subclassable schema for an array with extrinsic ranges.
	 * @alpha
	 */
	export type Schema<
		TUserScope extends string,
		TRangeDataSchema extends ImplicitAllowedTypes,
		TContentSchema extends ImplicitAllowedTypes,
	> = Statics<
		ErasedNode<Members<TRangeDataSchema, TContentSchema>, SchemaIdentifier<TUserScope>>,
		TContentSchema
	> &
		ErasedSchemaSubclassable<
			Members<TRangeDataSchema, TContentSchema>,
			SchemaIdentifier<TUserScope>
		>;
}
