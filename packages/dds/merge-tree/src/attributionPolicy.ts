/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { AttributionKey } from "@fluidframework/runtime-definitions/internal";

import { AttributionCollection } from "./attributionCollection.js";
// eslint-disable-next-line import/no-deprecated
import { Client } from "./client.js";
// eslint-disable-next-line import/no-deprecated
import { AttributionPolicy } from "./mergeTree.js";
import {
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeDeltaOpArgs,
	IMergeTreeMaintenanceCallbackArgs,
	IMergeTreeSegmentDelta,
	MergeTreeMaintenanceType,
} from "./mergeTreeDeltaCallback.js";
import { MergeTreeDeltaType } from "./ops.js";

// Note: these thinly wrap MergeTreeDeltaCallback and MergeTreeMaintenanceCallback to provide the client.
// This is because the base callbacks don't always have enough information to infer whether the op being
// processed is in a detached or attached state, which may affect the attribution key.
interface AttributionCallbacks {
	delta: (
		opArgs: IMergeTreeDeltaOpArgs,
		deltaArgs: IMergeTreeDeltaCallbackArgs,
		// eslint-disable-next-line import/no-deprecated
		client: Client,
	) => void;
	maintenance: (
		maintenanceArgs: IMergeTreeMaintenanceCallbackArgs,
		opArgs: IMergeTreeDeltaOpArgs | undefined,
		// eslint-disable-next-line import/no-deprecated
		client: Client,
	) => void;
}

function createAttributionPolicyFromCallbacks({
	delta,
	maintenance,
	// eslint-disable-next-line import/no-deprecated
}: AttributionCallbacks): AttributionPolicy {
	let unsubscribe: undefined | (() => void);
	return {
		// eslint-disable-next-line import/no-deprecated
		attach: (client: Client): void => {
			assert(unsubscribe === undefined, 0x557 /* cannot attach to multiple clients at once */);

			const deltaSubscribed: AttributionCallbacks["delta"] = (opArgs, deltaArgs) =>
				delta(opArgs, deltaArgs, client);
			const maintenanceSubscribed: AttributionCallbacks["maintenance"] = (args, opArgs) =>
				maintenance(args, opArgs, client);

			client.on("delta", deltaSubscribed);
			client.on("maintenance", maintenanceSubscribed);

			unsubscribe = (): void => {
				client.off("delta", deltaSubscribed);
				client.off("maintenance", maintenanceSubscribed);
			};
		},
		detach: (): void => {
			unsubscribe?.();
			unsubscribe = undefined;
		},
		get isAttached(): boolean {
			return unsubscribe !== undefined;
		},
		serializer: AttributionCollection,
	};
}

const ensureAttributionCollectionCallbacks: AttributionCallbacks = {
	delta: ({ op }, { deltaSegments }) => {
		if (op.type === MergeTreeDeltaType.INSERT) {
			for (const { segment } of deltaSegments) {
				segment.attribution = new AttributionCollection(segment.cachedLength);
			}
		}
	},
	maintenance: () => {},
};

const getAttributionKey = (
	// eslint-disable-next-line import/no-deprecated
	client: Client,
	msg: ISequencedDocumentMessage | undefined,
): AttributionKey => {
	if (msg) {
		return { type: "op", seq: msg.sequenceNumber };
	}
	const collabWindow = client.getCollabWindow();
	return collabWindow.collaborating ? { type: "local" } : { type: "detached", id: 0 };
};

const attributeInsertionOnSegments = (
	deltaSegments: IMergeTreeSegmentDelta[],
	key: AttributionKey,
): void => {
	for (const { segment } of deltaSegments) {
		if (segment.seq !== undefined) {
			segment.attribution?.update(
				undefined,
				new AttributionCollection(segment.cachedLength, key),
			);
		}
	}
};

const insertOnlyAttributionPolicyCallbacks: AttributionCallbacks = {
	delta: (opArgs, { deltaSegments, operation }, client) => {
		if (operation === MergeTreeDeltaType.INSERT) {
			attributeInsertionOnSegments(
				deltaSegments,
				getAttributionKey(client, opArgs.sequencedMessage),
			);
		}
	},
	maintenance: ({ deltaSegments, operation }, opArgs, client) => {
		if (
			operation === MergeTreeMaintenanceType.ACKNOWLEDGED &&
			opArgs?.op.type === MergeTreeDeltaType.INSERT
		) {
			attributeInsertionOnSegments(
				deltaSegments,
				getAttributionKey(client, opArgs.sequencedMessage),
			);
		}
	},
};

function createPropertyTrackingMergeTreeCallbacks(
	...propNames: string[]
): AttributionCallbacks {
	const toTrack = propNames.map((entry) => ({ propName: entry, channelName: entry }));
	const attributeAnnotateOnSegments = (
		isLocal: boolean,
		deltaSegments: IMergeTreeSegmentDelta[],
		{ op }: IMergeTreeDeltaOpArgs,
		key: AttributionKey,
	): void => {
		for (const { segment, propertyDeltas } of deltaSegments) {
			for (const { propName, channelName } of toTrack) {
				const shouldAttributeInsert =
					op.type === MergeTreeDeltaType.INSERT &&
					segment.properties?.[propName] !== undefined;

				const shouldAttributeAnnotate =
					op.type === MergeTreeDeltaType.ANNOTATE &&
					// Only attribute annotations which change the tracked property
					(op.props?.[propName] !== undefined || op.adjust?.[propName] !== undefined) &&
					(isLocal || (propertyDeltas !== undefined && propName in propertyDeltas));

				if (shouldAttributeInsert || shouldAttributeAnnotate) {
					segment.attribution?.update(
						channelName,
						new AttributionCollection(segment.cachedLength, key),
					);
				}
			}
		}
	};
	return {
		delta: (opArgs, { deltaSegments }, client): void => {
			const { op, sequencedMessage } = opArgs;
			if (op.type === MergeTreeDeltaType.ANNOTATE || op.type === MergeTreeDeltaType.INSERT) {
				attributeAnnotateOnSegments(
					sequencedMessage === undefined,
					deltaSegments,
					opArgs,
					getAttributionKey(client, sequencedMessage),
				);
			}
		},
		maintenance: ({ deltaSegments, operation }, opArgs, client): void => {
			if (operation === MergeTreeMaintenanceType.ACKNOWLEDGED && opArgs !== undefined) {
				attributeAnnotateOnSegments(
					true,
					deltaSegments,
					opArgs,
					getAttributionKey(client, opArgs.sequencedMessage),
				);
			}
		},
	};
}

function combineMergeTreeCallbacks(callbacks: AttributionCallbacks[]): AttributionCallbacks {
	return {
		delta: (...args): void => {
			for (const { delta } of callbacks) delta(...args);
		},
		maintenance: (...args): void => {
			for (const { maintenance } of callbacks) maintenance(...args);
		},
	};
}

/**
 * Creates an {@link AttributionPolicy} which only tracks initial insertion of content.
 * @internal
 */
// eslint-disable-next-line import/no-deprecated
export function createInsertOnlyAttributionPolicy(): AttributionPolicy {
	return createAttributionPolicyFromCallbacks(
		combineMergeTreeCallbacks([
			ensureAttributionCollectionCallbacks,
			insertOnlyAttributionPolicyCallbacks,
		]),
	);
}

/**
 * Creates an {@link AttributionPolicy} for tracking annotation of specific properties.
 * @param propNames - List of property names for which attribution should be tracked.
 * @returns A policy which only attributes annotation of the properties specified.
 * Keys for each property are stored under attribution channels of the same name--see example below.
 *
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
 * @internal
 */
export function createPropertyTrackingAttributionPolicyFactory(
	...propNames: string[]
	// eslint-disable-next-line import/no-deprecated
): () => AttributionPolicy {
	return () =>
		createAttributionPolicyFromCallbacks(
			combineMergeTreeCallbacks([
				ensureAttributionCollectionCallbacks,
				createPropertyTrackingMergeTreeCallbacks(...propNames),
			]),
		);
}

/**
 * Creates an attribution policy which tracks insertion as well as annotation of certain property names.
 * This combines the policies creatable using {@link createPropertyTrackingAttributionPolicyFactory} and
 * {@link createInsertOnlyAttributionPolicy}: see there for more details.
 * @internal
 */
export function createPropertyTrackingAndInsertionAttributionPolicyFactory(
	...propNames: string[]
	// eslint-disable-next-line import/no-deprecated
): () => AttributionPolicy {
	return () =>
		createAttributionPolicyFromCallbacks(
			combineMergeTreeCallbacks([
				ensureAttributionCollectionCallbacks,
				insertOnlyAttributionPolicyCallbacks,
				createPropertyTrackingMergeTreeCallbacks(...propNames),
			]),
		);
}
