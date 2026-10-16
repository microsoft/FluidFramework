/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ArrayPlaceAnchor } from "../simple-tree/index.js";

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
	 * Use {@link RangeCollection.removeTrackedRange} to remove the range.
	 * Change both endpoints with {@link RangeCollection.setRangeBounds}.
	 */
	readonly start: ArrayPlaceAnchor;

	/**
	 * Anchor for the exclusive end of the range.
	 * @remarks
	 * This is a borrowed anchor with the same ownership and editing rules as {@link TrackedRange.start}.
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
	 */
	keys(): IterableIterator<string>;
}
