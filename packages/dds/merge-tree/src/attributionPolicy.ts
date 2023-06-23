/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { AttributionKey } from "@fluidframework/runtime-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { UsageError } from "@fluidframework/container-utils";
import { Client } from "./client";
import {
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeDeltaOpArgs,
	IMergeTreeMaintenanceCallbackArgs,
	IMergeTreeSegmentDelta,
	MergeTreeMaintenanceType,
} from "./mergeTreeDeltaCallback";
import { MergeTreeDeltaType } from "./ops";
import { AttributionCollection, IAttributionCollectionSerializer } from "./attributionCollection";

// Note: these thinly wrap MergeTreeDeltaCallback and MergeTreeMaintenanceCallback to provide the client.
// This is because the base callbacks don't always have enough information to infer whether the op being
// processed is in a detached or attached state, which may affect the attribution key.
interface AttributionCallbacks {
	delta: (
		opArgs: IMergeTreeDeltaOpArgs,
		deltaArgs: IMergeTreeDeltaCallbackArgs,
		client: Client,
	) => void;
	maintenance: (
		maintenanceArgs: IMergeTreeMaintenanceCallbackArgs,
		opArgs: IMergeTreeDeltaOpArgs | undefined,
		client: Client,
	) => void;
}

function createAttributionPolicyFromCallbacks({
	delta,
	maintenance,
}: AttributionCallbacks): AttributionPolicy {
	let unsubscribe: undefined | (() => void);
	return {
		attach: (client: Client) => {
			assert(
				unsubscribe === undefined,
				0x557 /* cannot attach to multiple clients at once */,
			);

			const deltaSubscribed = (opArgs, deltaArgs) => delta(opArgs, deltaArgs, client);
			const maintenanceSubscribed = (args, opArgs) => maintenance(args, opArgs, client);

			client.on("delta", deltaSubscribed);
			client.on("maintenance", maintenanceSubscribed);

			unsubscribe = () => {
				client.off("delta", deltaSubscribed);
				client.off("maintenance", maintenanceSubscribed);
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

function createPropertyTrackingMergeTreeCallbacks(...propNames: string[]): AttributionCallbacks {
	const toTrack = propNames.map((entry) => ({ propName: entry, channelName: entry }));
	const attributeAnnotateOnSegments = (
		deltaSegments: IMergeTreeSegmentDelta[],
		{ op, sequencedMessage }: IMergeTreeDeltaOpArgs,
		key: AttributionKey,
	): void => {
		for (const { segment } of deltaSegments) {
			for (const { propName, channelName } of toTrack) {
				const shouldAttributeInsert =
					op.type === MergeTreeDeltaType.INSERT &&
					segment.properties?.[propName] !== undefined;

				const isLocal = sequencedMessage === undefined;
				const shouldAttributeAnnotate =
					op.type === MergeTreeDeltaType.ANNOTATE &&
					// Only attribute annotations which change the tracked property
					op.props[propName] !== undefined &&
					// Local changes to the tracked property always take effect
					(isLocal ||
						// Acked changes only take effect if there isn't a pending local change
						(!isLocal && !segment.propertyManager?.hasPendingProperty(propName)));

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
		delta: (opArgs, { deltaSegments }, client) => {
			const { op, sequencedMessage } = opArgs;
			if (op.type === MergeTreeDeltaType.ANNOTATE || op.type === MergeTreeDeltaType.INSERT) {
				attributeAnnotateOnSegments(
					deltaSegments,
					opArgs,
					getAttributionKey(client, sequencedMessage),
				);
			}
		},
		maintenance: ({ deltaSegments, operation }, opArgs, client) => {
			if (operation === MergeTreeMaintenanceType.ACKNOWLEDGED && opArgs !== undefined) {
				attributeAnnotateOnSegments(
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
		delta: (...args) => callbacks.forEach(({ delta }) => delta(...args)),
		maintenance: (...args) => callbacks.forEach(({ maintenance }) => maintenance(...args)),
	};
}

/**
 * Produces {@link AttributionPolicy}s which track only insertion of content.
 */
export class InsertOnlyAttributionPolicyFactory implements IAttributionPolicyFactory {
	public readonly name = "InsertOnly";
	create() {
		return createAttributionPolicyFromCallbacks(
			combineMergeTreeCallbacks([
				ensureAttributionCollectionCallbacks,
				insertOnlyAttributionPolicyCallbacks,
			]),
		);
	}
}

/**
 * Options which can be used by
 */
export interface PropertyTrackingAttributionOptions {
	name: string;

	/**
	 * List of property names for which attribution should be tracked.
	 */
	propNames: string[];
}

/**
 * {@link IAttributionPolicyFactory} which tracks only attribution of certain properties on a SharedString.
 * @alpha
 */
export class PropertyTrackingAttributionPolicyFactory implements IAttributionPolicyFactory {
	/**
	 *
	 * @param name - See {@link IAttributionPolicyFactory.name}
	 * @param propNames -  Keys for each property are stored under attribution channels of the same name--see example below.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Use this policy when creating your merge-tree:
	 * const factory = new PropertyTrackingAttributionPolicyFactory("emphasis", ["bold", "italic"]);
	 * // ... later, you can get attribution keys for the last time the "bold" and "italic"
	 * // properties were changed on a segment using `getAtOffset`:
	 * const lastBoldedAttributionKey = segment.attribution?.getAtOffset(0, "bold");
	 * const lastItalicizedAttributionKey = segment.attribution?.getAtOffset(0, "italic");
	 * ```
	 */
	public constructor(public readonly name, private readonly propNames: string[]) {}
	public create() {
		return createAttributionPolicyFromCallbacks(
			combineMergeTreeCallbacks([
				ensureAttributionCollectionCallbacks,
				createPropertyTrackingMergeTreeCallbacks(...this.propNames),
			]),
		);
	}
}

/**
 * Attribution policy which tracks insertion as well as annotation of certain property names.
 * This combines the policies creatable using {@link PropertyTrackingAttributionPolicyFactory} and
 * {@link InsertOnlyAttributionPolicyFactory}: see there for more details.
 * @alpha
 */
export class PropertyTrackingAndInsertionAttributionPolicyFactory
	implements IAttributionPolicyFactory
{
	public constructor(public readonly name, private readonly propNames: string[]) {}
	public create() {
		return createAttributionPolicyFromCallbacks(
			combineMergeTreeCallbacks([
				ensureAttributionCollectionCallbacks,
				insertOnlyAttributionPolicyCallbacks,
				createPropertyTrackingMergeTreeCallbacks(...this.propNames),
			]),
		);
	}
}

/**
 * Implements policy dictating which kinds of operations should be attributed and how.
 * @alpha
 * @sealed
 */
export interface AttributionPolicy {
	/**
	 * Enables tracking attribution information for operations on this merge-tree.
	 * This function is expected to subscribe to appropriate change events in order
	 * to manage any attribution data it stores on segments.
	 *
	 * This must be done in an eventually consistent fashion.
	 * @internal
	 */
	attach: (client: Client) => void;
	/**
	 * Disables tracking attribution information on segments.
	 * @internal
	 */
	detach: () => void;
	/**
	 * @internal
	 */
	isAttached: boolean;
	/**
	 * Serializer capable of serializing any attribution data this policy stores on segments.
	 * @internal
	 */
	serializer: IAttributionCollectionSerializer;
}

/**
 * IAttributionPolicyFactory create data stores. It is associated with an identifier (its `name` member)
 * and usually provided to consumers using this mapping through an {@link AttributionPolicyRegistry}.
 * @alpha
 */
export interface IAttributionPolicyFactory {
	/**
	 * String that uniquely identifies the type of data store created by this factory.
	 * @remarks - Beware that the name chosen here is typically persisted in the document and used as an identifier
	 * to look up the correct attribution policy from an {@link (IAttributionPolicyRegistry:interface)}. Thus, changes to
	 * supported attribution policies have compatibility constraints!
	 */
	name: string;

	/**
	 * Generates runtime for the data store from the data store context. Once created should be bound to the context.
	 * @param context - Context for the data store.
	 * @param existing - If instantiating from an existing file.
	 */
	create(): AttributionPolicy;
}

/**
 * An associated pair of an identifier and registry entry.
 * @alpha
 */
export type NamedAttributionPolicyRegistryEntry = [string, IAttributionPolicyFactory];

/**
 * An iterable identifier/registry entry pair list
 * @alpha
 */
export type NamedAttributionPolicyRegistryEntries = Iterable<NamedAttributionPolicyRegistryEntry>;

/**
 * @alpha
 */
export const IAttributionPolicyRegistry: keyof IProvideAttributionPolicyRegistry =
	"IAttributionPolicyRegistry";

/**
 * FluidObject provider-pattern for {@link (IAttributionPolicyRegistry:interface)}.
 * @alpha
 */
export interface IProvideAttributionPolicyRegistry {
	readonly IAttributionPolicyRegistry: IAttributionPolicyRegistry;
}

/**
 * An association of policy names to attribution policy factories, which can be used to enable attribution on a merge-tree.
 * @remarks - A simple implementation is provided for application authors, see {@link AttributionPolicyRegistry}.
 * @alpha
 */
export interface IAttributionPolicyRegistry extends IProvideAttributionPolicyRegistry {
	get(name: string): IAttributionPolicyFactory | undefined;
}

/**
 * Basic implementation of {@link (IAttributionPolicyRegistry:interface)} exported for convenience.
 */
export class AttributionPolicyRegistry implements IAttributionPolicyRegistry {
	private readonly map: Map<string, IAttributionPolicyFactory>;

	public get IAttributionPolicyRegistry() {
		return this;
	}

	constructor(namedEntries: NamedAttributionPolicyRegistryEntries) {
		this.map = new Map();
		for (const [key, value] of namedEntries) {
			if (this.map.has(key)) {
				throw new UsageError("Duplicate entry names exist");
			}
			this.map.set(key, value);
		}
	}

	public get(name: string): IAttributionPolicyFactory | undefined {
		return this.map.get(name);
	}
}
