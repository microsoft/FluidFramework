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
 * APIs for storing extrinsic locations in trees.
 *
 * @remarks
 * In this context extrinsic locations refer to references to positions in the tree, which are stored at a location away from the actual referenced position.
 *
 * Some similar cases which have alternative solutions (listed here to help with discoverability of alternatives: prefer these solutions when relevant):
 * - Lookup of locations of {@link TreeNode | TreeNodes} (which you can hold references to in memory): hold onto the `TreeNode` itself, and use {@link (TreeNodeApi:interface).parent | Tree.parent} and {@link (TreeNodeApi:interface).key | Tree.key} if needed.
 * - Lookup of nodes based on leaf data stored on them: use {@link TreeIndex}.
 * - Tracking of a location in an array, in memory: use {@link createArrayInsertionAnchor} or just hold onto the {@link TreeNode} at that location.
 * - Sharing a location that only needs to work in the current revision: use a TreeNode and/or key within the node if in memory, or a full path (via {@link (TreeNodeApi:interface).parent | Tree.parent} and {@link (TreeNodeApi:interface).key | Tree.key}) if needed.
 * - Sharing transient locations between collaborating clients (for example, presence): use {@link UntypedTreeViewAlpha.locations | TreeViewAlpha.locations}.
 *
 * Only use `ExtrinsicLocations` when the location in question must be stored in the tree, and it can't be done better through any of the above means.
 * Current support is limited to array ranges, including {@link FormattedText.createSchemaWithRanges | range-enabled formatted text}.
 * Range-maintenance edits use document-wide {@link NoChangeConstraint | no-change constraints};
 * concurrent changes anywhere in the document can reject the entire guarded edit.
 * Requires {@link @fluidframework/runtime-definitions#OldestSupportedClientVersion} of at least `2.80.0`.
 *
 * This is an early implementation, not robust native support for persistent locations.
 * Future versions may provide more robust support.
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
	 * All writers must use the provided content and range editing APIs.
	 * Other view schemas or imports that bypass them can leave stale range bounds.
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
		 * Edits to the array are tracked during the callback, and the ranges are updated accordingly.
		 * Content edits and range updates occur in the same transaction.
		 * Structural editing methods on {@link FormattedText.MembersWithRanges | range-enabled formatted text} track content edits and update ranges automatically.
		 *
		 * Content edits and their events occur normally during the callback.
		 * Range positions returned by {@link ExtrinsicLocations.RangeCollection.getRange} track those edits.
		 * Do not retain the mutable array for editing after the callback returns.
		 *
		 * Ranges can be read and their data edited during this call.
		 * Adding or removing ranges in this manager's collection or explicitly changing their bounds during this call
		 * throws a {@link @fluidframework/telemetry-utils#UsageError}.
		 * Perform those operations before or after this call, optionally within an enclosing transaction.
		 * Calls on the same manager cannot be nested.
		 * For moves between managed arrays, nest the two managers' callbacks so both arrays
		 * are edited only while their respective callbacks are active.
		 * Ranges remain with their manager rather than following moved content.
		 *
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
	 * @remarks
	 * Adding or removing ranges and explicitly changing bounds are forbidden during calls to
	 * {@link ExtrinsicLocations.ArrayMembers.transactOnContent} or structural editing methods on
	 * {@link FormattedText.MembersWithRanges | range-enabled formatted text} for this collection's content.
	 * Reading ranges and editing their data remain allowed.
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
		 * Also throws during content-editing calls as described in {@link ExtrinsicLocations.RangeCollection}.
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
		 * Also throws during content-editing calls as described in {@link ExtrinsicLocations.RangeCollection}.
		 */
		setRangeBounds(key: string, bounds: RangeEndpoints): void;

		/**
		 * Removes a range and its associated data without changing the content.
		 * @param key - Key of a tracked range.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the key is not tracked.
		 * Also throws during content-editing calls as described in {@link ExtrinsicLocations.RangeCollection}.
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
