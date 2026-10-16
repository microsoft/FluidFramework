/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EmptyKey } from "../core/index.js";
import {
	createCustomizedFluidFrameworkScopedFactory,
	eraseSchemaDetailsSubclassable,
	SchemaFactory,
	type ArrayPlaceAnchor,
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

/**
 * APIs for extrinsic locations and ranges in arrays and formatted text.
 * @remarks
 * Includes shared range collections and handles, and a schema factory for arrays with separately stored ranges.
 * For formatted text, use {@link FormattedText.createSchemaWithRanges}.
 *
 * A range stores two indexes into the content array and application-defined data.
 * Edit managed arrays through {@link ExtrinsicLocations.ArrayMembers} to keep these indexes consistent.
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
export namespace ExtrinsicLocations {
	/**
	 * Creates a subclassable schema for an array with extrinsic ranges.
	 * @param inputSchemaFactory - Factory whose scope distinguishes this schema from other parameterizations.
	 * Keep the scope and parameter schemas stable when opening existing documents.
	 * @param rangeDataSchema - Schema for the data associated with each range.
	 * @param contentSchema - Schema for the items in the content array.
	 * @returns A schema with {@link ExtrinsicLocations.ArrayStatics} for construction and
	 * {@link ExtrinsicLocations.ArrayMembers} for reading and editing.
	 * @remarks
	 * Generated identifiers use the scope `com.fluidframework.extrinsicRanges<user-scope>`.
	 * Use a different factory scope for each distinct parameterization in a document.
	 * Subclasses must not replace the `content`, `rangeStorage`, or `ranges` members.
	 * @alpha
	 */
	export function createArraySchema<
		const TUserScope extends string,
		const TRangeDataSchema extends ImplicitAllowedTypes,
		const TContentSchema extends ImplicitAllowedTypes,
	>(
		inputSchemaFactory: SchemaFactoryBeta<TUserScope>,
		rangeDataSchema: TRangeDataSchema,
		contentSchema: TContentSchema,
	): ArraySchema<TUserScope, TRangeDataSchema, TContentSchema> {
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
			implements ArrayMembers<TRangeDataSchema, TContentSchema>
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
			ArrayMembers<TRangeDataSchema, TContentSchema>,
			ArraySchemaIdentifier<TUserScope>
		>;
		return eraseSchemaDetailsSubclassable<
			ArrayMembers<TRangeDataSchema, TContentSchema>,
			ArrayStatics<Node, TContentSchema>
		>()(Manager);
	}

	/**
	 * Reading and editing APIs for an array with extrinsic ranges.
	 * @remarks
	 * Edit content synchronously with {@link ExtrinsicLocations.ArrayMembers.transactOnContent}.
	 * Content items and range data that are object nodes can still be edited directly.
	 * Such edits do not change array positions.
	 * @sealed
	 * @alpha
	 */
	export interface ArrayMembers<
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
		 * Range positions returned by {@link ExtrinsicLocations.RangeCollection.getRange}
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
	export interface ArrayStatics<TNode, TContentSchema extends ImplicitAllowedTypes> {
		/**
		 * Creates an array with no ranges.
		 * @param content - Initial content. Defaults to an empty array.
		 * @returns A new, unhydrated node of this schema.
		 * @remarks
		 * Use {@link ExtrinsicLocations.RangeCollection.trackNewRange} to add ranges after construction.
		 */
		create(
			content?: Iterable<InsertableTreeNodeFromImplicitAllowedTypes<TContentSchema>>,
		): TNode;
	}

	/**
	 * Identifier of a generated array-with-ranges schema.
	 * @alpha
	 */
	export type ArraySchemaIdentifier<TUserScope extends string> = ScopedSchemaName<
		`com.fluidframework.extrinsicRanges<${TUserScope}>`,
		"Manager"
	>;

	/**
	 * An erased, subclassable schema for an array with extrinsic ranges.
	 * @alpha
	 */
	export type ArraySchema<
		TUserScope extends string,
		TRangeDataSchema extends ImplicitAllowedTypes,
		TContentSchema extends ImplicitAllowedTypes,
	> = ArrayStatics<
		ErasedNode<
			ArrayMembers<TRangeDataSchema, TContentSchema>,
			ArraySchemaIdentifier<TUserScope>
		>,
		TContentSchema
	> &
		ErasedSchemaSubclassable<
			ArrayMembers<TRangeDataSchema, TContentSchema>,
			ArraySchemaIdentifier<TUserScope>
		>;

	/**
	 * Bounds of a half-open range in content-item indexes.
	 * @sealed
	 * @alpha
	 */
	export interface RangeEndpoints {
		/**
		 * Inclusive start index.
		 */
		readonly start: number;
		/**
		 * Exclusive end index. Equal endpoints describe an empty range.
		 */
		readonly end: number;
	}

	/**
	 * A live handle to a tracked range and its application-defined data.
	 * @typeParam TData - Type of data read from the range.
	 * @typeParam TInsertableData - Type of data accepted when replacing the range's data.
	 * @remarks
	 * Endpoints follow insertion-point semantics: insertion at an endpoint moves it after the inserted content.
	 * Insertion at the start is excluded, insertion at the end is included, and empty ranges stay empty.
	 * Removal collapses endpoints inside the removed span to the start of that span.
	 * Ranges remain with their collection rather than following moved content.
	 *
	 * Each endpoint anchor's `index` returns its current position, including during a content editing scope.
	 * A known array-anchor event-ordering limitation can cause listeners registered before the scope to read stale positions.
	 * Reads after a content edit returns within the scope are current.
	 * Copy the endpoint indexes to retain a snapshot.
	 *
	 * A handle refers to a particular range, not to subsequent ranges created at the same key.
	 * Reading an endpoint index or assigning data throws a {@link @fluidframework/telemetry-utils#UsageError} if that range is no longer tracked.
	 * Undo that restores the same range makes the handle valid again.
	 * Each handle retains the same endpoint anchor objects as its bounds change.
	 * Repeated lookups do not guarantee the same handle object.
	 * @sealed
	 * @alpha
	 */
	export interface TrackedRange<TData, TInsertableData = TData> {
		/**
		 * Anchor for the inclusive start of the range.
		 * @remarks
		 * This is a borrowed anchor owned by the tracked range.
		 * Do not dispose it: calling `dispose()` throws a {@link @fluidframework/telemetry-utils#UsageError}.
		 * Use {@link ExtrinsicLocations.RangeCollection.removeTrackedRange} to remove the range.
		 * Change both endpoints with {@link ExtrinsicLocations.RangeCollection.setRangeBounds}.
		 */
		readonly start: ArrayPlaceAnchor;

		/**
		 * Anchor for the exclusive end of the range.
		 * @remarks
		 * This is a borrowed anchor with the same ownership and editing rules as {@link ExtrinsicLocations.TrackedRange.start}.
		 */
		readonly end: ArrayPlaceAnchor;

		/**
		 * Application-defined data.
		 * @remarks
		 * Object data can be edited without changing the range endpoints.
		 * Assigning this property replaces the data without changing the range's identity or endpoints.
		 * Data edits use ordinary tree editing semantics, without a range-maintenance transaction.
		 */
		get data(): TData;
		set data(value: TInsertableData);
	}

	/**
	 * A live collection of string-keyed extrinsic ranges.
	 * @typeParam TData - Type of data read from a range.
	 * @typeParam TInsertableData - Type of data accepted when creating ranges or replacing their data.
	 * @sealed
	 * @alpha
	 */
	export interface RangeCollection<TData, TInsertableData = TData> {
		/**
		 * Creates a tracked range without changing the content.
		 * @param key - Unique key for the new range.
		 * @param bounds - Initial endpoints in the current content.
		 * @param data - Application-defined range data.
		 * @returns A live handle to the new range.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the key is already tracked or the endpoints are invalid.
		 */
		trackNewRange(
			key: string,
			bounds: RangeEndpoints,
			data: TInsertableData,
		): TrackedRange<TData, TInsertableData>;

		/**
		 * Looks up a tracked range without creating stored state.
		 * @param key - Range key to look up.
		 * @returns A live handle, or `undefined` if the key is not tracked.
		 */
		getRange(key: string): TrackedRange<TData, TInsertableData> | undefined;

		/**
		 * Changes both endpoints without changing the range's data or identity.
		 * @param key - Key of a tracked range.
		 * @param bounds - New endpoints in the current content.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the key is not tracked or the endpoints are invalid.
		 */
		setRangeBounds(key: string, bounds: RangeEndpoints): void;

		/**
		 * Removes a range and its associated data without changing the content.
		 * @param key - Key of a tracked range.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the key is not tracked.
		 */
		removeTrackedRange(key: string): void;

		/**
		 * Iterates over the tracked keys in unspecified order.
		 * @returns An iterator over the current storage's keys.
		 * An iterator does not follow replacement of the underlying storage.
		 * @privateRemarks
		 * TODO: We should probably provide efficient ways to find ranges by their locations.
		 * Maybe make this API take in an optional range, and enumerate all ranges which overlap it,
		 * or perhaps provide a way to iterate over ranges in order of their start positions starting from a given position.
		 */
		keys(): IterableIterator<string>;
	}
}
