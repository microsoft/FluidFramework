/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { AttributionKey } from "@fluidframework/runtime-definitions";
import { AttributionPolicy } from "./mergeTree";
import { Client } from "./client";
import { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants";
import {
	MergeTreeDeltaCallback,
	MergeTreeMaintenanceCallback,
	MergeTreeMaintenanceType,
} from "./mergeTreeDeltaCallback";
import { MergeTreeDeltaType } from "./ops";
import { AttributionCollection } from "./attributionCollection";

interface MergeTreeCallbacks {
	delta: MergeTreeDeltaCallback;
	maintenance: MergeTreeMaintenanceCallback;
}

function createAttributionPolicyFromCallbacks({
	delta,
	maintenance,
}: MergeTreeCallbacks): AttributionPolicy {
	let unsubscribe: undefined | (() => void);
	return {
		attach: (client: Client) => {
			assert(
				unsubscribe === undefined,
				0x557 /* cannot attach to multiple clients at once */,
			);

			client.on("delta", delta);
			client.on("maintenance", maintenance);

			unsubscribe = () => {
				client.off("delta", delta);
				client.off("maintenance", maintenance);
			};
		},
		detach: () => {
			unsubscribe?.();
			unsubscribe = undefined;
		},
		get isAttached() {
			return unsubscribe !== undefined;
		},
		serializer: AttributionCollection,
	};
}

const insertOnlyAttributionPolicyCallbacks: MergeTreeCallbacks = {
	delta: (opArgs, { deltaSegments, operation }) => {
		if (operation !== MergeTreeDeltaType.INSERT) {
			return;
		}

		for (const { segment } of deltaSegments) {
			if (segment.seq !== undefined && segment.seq !== UnassignedSequenceNumber) {
				const key: AttributionKey =
					segment.seq === UniversalSequenceNumber
						? { type: "detached", id: 0 }
						: { type: "op", seq: segment.seq };
				const attribution = new AttributionCollection(segment.cachedLength, key);
				segment.attribution?.update(undefined, attribution);
			}
		}
	},
	maintenance: ({ deltaSegments, operation }, opArgs) => {
		if (
			operation !== MergeTreeMaintenanceType.ACKNOWLEDGED ||
			opArgs === undefined ||
			opArgs.op.type !== MergeTreeDeltaType.INSERT
		) {
			return;
		}
		for (const { segment } of deltaSegments) {
			assert(segment.seq !== undefined, 0x558 /* segment.seq should be set after ack. */);
			const attribution = new AttributionCollection(segment.cachedLength, {
				type: "op",
				seq: segment.seq,
			});
			segment.attribution?.update(undefined, attribution);
		}
	},
};

const ensureAttributionCollectionCallbacks: MergeTreeCallbacks = {
	delta: ({ op, sequencedMessage }, { deltaSegments, operation }) => {
		if (sequencedMessage !== undefined && op.type === MergeTreeDeltaType.INSERT) {
			for (const { segment } of deltaSegments) {
				segment.attribution = new AttributionCollection(segment.cachedLength);
			}
		}
	},
	maintenance: ({ deltaSegments, operation }, opArgs) => {
		if (
			operation === MergeTreeMaintenanceType.ACKNOWLEDGED &&
			opArgs?.op.type === MergeTreeDeltaType.INSERT
		) {
			for (const { segment } of deltaSegments) {
				segment.attribution = new AttributionCollection(segment.cachedLength);
			}
		}
	},
};

function createPropertyTrackingMergeTreeCallbacks(
	...propertiesToTrack: string[]
): MergeTreeCallbacks {
	const toTrack = propertiesToTrack.map((entry) => ({ propName: entry, channelName: entry }));
	return {
		delta: ({ op, sequencedMessage }, { deltaSegments, operation }) => {
			if (sequencedMessage === undefined) {
				// Only attribute acked operations.
				// TODO: how does this work with detached? write test cases!!
				return;
			}

			// TODO: detached
			const key: AttributionKey =
				sequencedMessage === undefined
					? { type: "detached", id: 0 }
					: { type: "op", seq: sequencedMessage.sequenceNumber };
			if (op.type === MergeTreeDeltaType.ANNOTATE) {
				for (const { propName, channelName } of toTrack) {
					if (op.props[propName] !== undefined) {
						for (const { segment } of deltaSegments) {
							if (!(segment.propertyManager?.hasPendingProperty(propName) ?? false)) {
								segment.attribution?.update(
									channelName,
									new AttributionCollection(segment.cachedLength, key),
								);
							}
						}
					}
				}
			} else if (op.type === MergeTreeDeltaType.INSERT) {
				for (const { propName, channelName } of toTrack) {
					for (const { segment } of deltaSegments) {
						if (segment.properties?.[propName] !== undefined) {
							segment.attribution?.update(
								channelName,
								new AttributionCollection(segment.cachedLength, key),
							);
						}
					}
				}
			}
		},
		maintenance: ({ deltaSegments, operation }, opArgs) => {
			if (operation !== MergeTreeMaintenanceType.ACKNOWLEDGED || opArgs === undefined) {
				return;
			}
			const { op, sequencedMessage } = opArgs;

			const key: AttributionKey =
				sequencedMessage === undefined
					? { type: "detached", id: 0 }
					: { type: "op", seq: sequencedMessage.sequenceNumber };
			if (op.type === MergeTreeDeltaType.ANNOTATE) {
				for (const { propName, channelName } of toTrack) {
					if (op.props[propName] !== undefined) {
						for (const { segment } of deltaSegments) {
							if (!(segment.propertyManager?.hasPendingProperty(propName) ?? false)) {
								segment.attribution?.update(
									channelName,
									new AttributionCollection(segment.cachedLength, key),
								);
							}
						}
					}
				}
			} else if (op.type === MergeTreeDeltaType.INSERT) {
				for (const { propName, channelName } of toTrack) {
					for (const { segment } of deltaSegments) {
						if (segment.properties?.[propName] !== undefined) {
							segment.attribution?.update(
								channelName,
								new AttributionCollection(segment.cachedLength, key),
							);
						}
					}
				}
			}
		},
	};
}

function combineMergeTreeCallbacks(callbacks: MergeTreeCallbacks[]): MergeTreeCallbacks {
	return {
		delta: (...args) => callbacks.forEach(({ delta }) => delta(...args)),
		maintenance: (...args) => callbacks.forEach(({ maintenance }) => maintenance(...args)),
	};
}

/**
 * @alpha
 * @returns - An {@link AttributionPolicy} which tracks only insertion of content.
 * Content is only attributed at ack time, unless the container is in a detached state.
 * Detached content is attributed with a {@link @fluidframework/runtime-definitions#DetachedAttributionKey}.
 */
export function createInsertOnlyAttributionPolicy(): AttributionPolicy {
	return createAttributionPolicyFromCallbacks(
		combineMergeTreeCallbacks([
			ensureAttributionCollectionCallbacks,
			insertOnlyAttributionPolicyCallbacks,
		]),
	);
}

/**
 *
 * @param propertiesToTrack - List of property names for which attribution should be tracked.
 * @returns - A policy which only attributes annotation of the properties specified.
 * Keys for each property are stored under attribution channels of the same name--see example below.
 * Content is only attributed at ack time, unless the container is in a detached state.
 * Detached content is attributed with a {@link @fluidframework/runtime-definitions#DetachedAttributionKey}.
 * @example
 *
 * ```typescript
 * // Use this policy when creating your merge-tree:
 * const policy = createPropertyTrackingAttributionPolicyFactory("bold", "italic");
 * // ... later, you can get attribution keys for the last time the "bold" and "italic"
 * // properties were changed on a segment using `getAtOffset`:
 * const lastBoldedAttributionKey = segment.attribution?.getAtOffset(0, "bold");
 * const lastItalicizedAttributionKey = segment.attribution?.getAtOffset(0, "italic");
 * ```
 * @alpha
 */
export function createPropertyTrackingAttributionPolicyFactory(
	...propertiesToTrack: string[]
): () => AttributionPolicy {
	return () =>
		createAttributionPolicyFromCallbacks(
			combineMergeTreeCallbacks([
				ensureAttributionCollectionCallbacks,
				createPropertyTrackingMergeTreeCallbacks(...propertiesToTrack),
			]),
		);
}

/**
 * Creates an attribution policy which tracks insertion as well as annotation of certain property names.
 * This combines the policies creatable using {@link createPropertyTrackingAttributionPolicyFactory} and
 * {@link createInsertOnlyAttributionPolicy}: see there for more details.
 * @alpha
 */
export function createPropertyTrackingAndInsertionAttributionPolicyFactory(
	...propertiesToTrack: string[]
): () => AttributionPolicy {
	return () =>
		createAttributionPolicyFromCallbacks(
			combineMergeTreeCallbacks([
				ensureAttributionCollectionCallbacks,
				insertOnlyAttributionPolicyCallbacks,
				createPropertyTrackingMergeTreeCallbacks(...propertiesToTrack),
			]),
		);
}
