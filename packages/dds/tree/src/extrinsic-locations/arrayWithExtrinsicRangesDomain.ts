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

/**
 * Schema and APIs for an array with separately stored ranges.
 * @remarks
 * A range stores two indexes into the content array and application-defined data.
 * Edit the array through {@link ArrayWithExtrinsicRanges.Members} to keep these indexes consistent.
 * Removing all content covered by a range collapses it to an empty range rather than deleting it.
 *
 * Each edit uses a document-wide {@link NoChangeConstraint}.
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
	 * Subclasses must not replace the `content` or `ranges` members, which are stored fields.
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
				ranges: [() => Ranges],
			})
			implements Members<TRangeDataSchema, TContentSchema>
		{
			#tracker: Tracker | undefined;

			public static create(content: Iterable<ContentInsertable> = []): Manager {
				return new this({ content: [...content], ranges: [] });
			}

			public transactOnContent(edit: (content: TreeArrayNode<TContentSchema>) => void): void {
				this.#getTracker().transactOnContent(edit);
			}

			public getExtrinsicRange(range: Range<TRangeDataSchema>): {
				readonly start: number;
				readonly end: number;
			} {
				return this.#getTracker().getExtrinsicRange(range);
			}

			public addExtrinsicRange(
				start: number,
				end: number,
				data: InsertableTreeNodeFromImplicitAllowedTypes<TRangeDataSchema>,
			): Range<TRangeDataSchema> {
				return this.#getTracker().addExtrinsicRange(start, end, data);
			}

			public setExtrinsicRange(
				range: Range<TRangeDataSchema>,
				start: number,
				end: number,
			): void {
				this.#getTracker().setExtrinsicRange(range, start, end);
			}

			public removeExtrinsicRange(range: Range<TRangeDataSchema>): void {
				this.#getTracker().removeExtrinsicRange(range);
			}

			#getTracker(): Tracker {
				return (this.#tracker ??= new ExtrinsicRangeTracker<
					Content,
					ExtrinsicRange,
					InsertableTreeNodeFromImplicitAllowedTypes<TRangeDataSchema>
				>(
					this.content,
					this.ranges,
					(start, end, data) => new ExtrinsicRange({ start, end, data }),
				));
			}
		}

		class Content extends sf.array("Content", contentSchema) {}
		class Ranges extends sf.array("Ranges", [() => ExtrinsicRange]) {}
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
	 * A handle to a half-open range `[start, end)` within the content array.
	 * @remarks
	 * Read its current endpoints with {@link ArrayWithExtrinsicRanges.Members.getExtrinsicRange}.
	 * Range objects retain their identity as their endpoints are updated.
	 * Both endpoints follow insertion-point semantics: an insertion exactly at an endpoint moves it
	 * after the inserted content.
	 * Thus insertion at the start is excluded, insertion at the end is included,
	 * and an empty range stays empty.
	 * Removal collapses endpoints inside the removed span to the start of that span.
	 * A range belongs to its container, not to the content it covers.
	 * @sealed
	 * @alpha
	 */
	export interface Range<TRangeDataSchema extends ImplicitAllowedTypes> {
		/**
		 * Application-defined data.
		 * @remarks
		 * You can edit fields of object data without changing the range endpoints.
		 */
		readonly data: TreeNodeFromImplicitAllowedTypes<TRangeDataSchema>;
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
		 * Live, read-only view of the extrinsic ranges, in creation order.
		 */
		readonly ranges: readonly Range<TRangeDataSchema>[];
		/**
		 * Edits the content array and persists the resulting range endpoints in the same transaction.
		 * @param edit - Synchronous callback with mutable access to the content array.
		 * @remarks
		 * Content edits and their events occur normally during the callback.
		 * Range positions returned by {@link ArrayWithExtrinsicRanges.Members.getExtrinsicRange}
		 * track those edits using temporary array insertion anchors.
		 * The underlying stored endpoint fields are not synchronized until the callback finishes.
		 * Do not retain the mutable array for editing after the callback returns.
		 *
		 * Range methods on this manager can be used inside the callback.
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
		/**
		 * Gets a snapshot of a range's current endpoints.
		 * @param range - A range currently belonging to this array.
		 * @returns The inclusive start and exclusive end indexes in the current content.
		 * This snapshot does not change when the array is edited.
		 * @remarks
		 * A known array-anchor event-ordering bug can cause change-event listeners registered
		 * before the editing scope to observe stale positions.
		 * Reads after a content edit returns within the callback are current.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the range does not belong to this array.
		 */
		getExtrinsicRange(range: Range<TRangeDataSchema>): {
			readonly start: number;
			readonly end: number;
		};
		/**
		 * Adds a range with application-defined data.
		 * @param start - Inclusive start index.
		 * @param end - Exclusive end index. Empty ranges are allowed.
		 * @param data - Data to associate with the range.
		 * @returns The live range object, which can be passed to the range editing methods.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the range is invalid.
		 */
		addExtrinsicRange(
			start: number,
			end: number,
			data: InsertableTreeNodeFromImplicitAllowedTypes<TRangeDataSchema>,
		): Range<TRangeDataSchema>;
		/**
		 * Changes a range's endpoints without changing its data or identity.
		 * @param range - A range currently belonging to this array.
		 * @param start - New inclusive start index.
		 * @param end - New exclusive end index.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the range does not belong to
		 * this array or the new endpoints are invalid.
		 */
		setExtrinsicRange(range: Range<TRangeDataSchema>, start: number, end: number): void;
		/**
		 * Removes a range without changing the content.
		 * @param range - A range currently belonging to this array.
		 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the range does not belong to this array.
		 */
		removeExtrinsicRange(range: Range<TRangeDataSchema>): void;
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
		 * Use {@link ArrayWithExtrinsicRanges.Members.addExtrinsicRange} to add ranges after construction.
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
