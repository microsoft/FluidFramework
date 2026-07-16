/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Walk a sequence of items, grouping each maximal run of contiguous items with the same key
 * into a "bunch" and invoking `onBunch` once per run.
 *
 * @remarks
 * This is the core pattern used by the Fluid runtime to dispatch operations to a data store
 * or DDS in bunches: inbound op processing (`processMessages`) and outbound resubmit
 * (`reSubmitMessages`) both walk a contiguous sequence of operations and dispatch each
 * maximal same-target run as a single call to the lower layer.
 *
 * The helper preserves input order. Each call to `onBunch` receives the key it was bunched
 * by along with the list of transformed bunch items in original order. Side effects that need
 * to happen per source item (e.g. delete checks, GC node updates) should be performed by the
 * caller around the call to this helper, not inside `valueOf` — `valueOf` is purely a shape
 * transformation from source item to bunch item.
 *
 * @param items - The source items to walk.
 * @param keyOf - Extracts the bunching key from a source item. Items with equal keys
 * (according to `keysEqual`) that appear contiguously are bunched together.
 * @param valueOf - Transforms a source item into its bunch-element form.
 * @param onBunch - Invoked once per bunch with the key and the bunch items.
 * @param keysEqual - Equality predicate for keys. Defaults to `Object.is`. Provide a custom
 * predicate to bunch by structured / composite keys.
 *
 * @internal
 */
export function forEachContiguousBunch<TItem, TKey, TBunchItem>(
	items: Iterable<TItem>,
	keyOf: (item: TItem) => TKey,
	valueOf: (item: TItem) => TBunchItem,
	onBunch: (key: TKey, bunch: TBunchItem[]) => void,
	keysEqual: (a: TKey, b: TKey) => boolean = Object.is,
): void {
	let currentKey: TKey | undefined;
	let hasCurrentKey = false;
	let bunch: TBunchItem[] = [];

	for (const item of items) {
		const key = keyOf(item);
		if (hasCurrentKey && !keysEqual(currentKey as TKey, key)) {
			onBunch(currentKey as TKey, bunch);
			bunch = [];
		}
		currentKey = key;
		hasCurrentKey = true;
		bunch.push(valueOf(item));
	}

	if (hasCurrentKey && bunch.length > 0) {
		onBunch(currentKey as TKey, bunch);
	}
}
