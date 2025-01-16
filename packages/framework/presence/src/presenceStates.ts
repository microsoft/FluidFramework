/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { BroadcastControlSettings } from "./broadcastControls.js";
import { RequiredBroadcastControl } from "./broadcastControls.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { ClientRecord } from "./internalTypes.js";
import type { RecordEntryTypes } from "./internalUtils.js";
import { getOrCreateRecord, objectEntries } from "./internalUtils.js";
import type { ClientSessionId, ISessionClient } from "./presence.js";
import type { LocalStateUpdateOptions, StateDatastore } from "./stateDatastore.js";
import { handleFromDatastore } from "./stateDatastore.js";
import type { PresenceStates, PresenceStatesSchema } from "./types.js";
import { unbrandIVM } from "./valueManager.js";

/**
 * Extracts `Part` from {@link InternalTypes.ManagerFactory} return type
 * matching the {@link PresenceStatesSchema} `Keys` given.
 *
 * @remarks
 * If the `Part` is an optional property, undefined will be included in the
 * result. Applying `Required` to the return type prior to extracting `Part`
 * does not work as expected. Use Exclude\<, undefined\> can be used as needed.
 *
 * @internal
 */
export type MapSchemaElement<
	TSchema extends PresenceStatesSchema,
	Part extends keyof ReturnType<TSchema[keyof TSchema]>,
	Keys extends keyof TSchema = keyof TSchema,
> = ReturnType<TSchema[Keys]>[Part];

/**
 * @internal
 */
export interface RuntimeLocalUpdateOptions {
	allowableUpdateLatencyMs: number;

	/**
	 * Special option allowed for unicast notifications.
	 */
	targetClientId?: ClientConnectionId;
}

/**
 * @internal
 */
export interface PresenceRuntime {
	readonly clientSessionId: ClientSessionId;
	lookupClient(clientId: ClientConnectionId): ISessionClient;
	localUpdate(
		states: { [key: string]: ClientUpdateEntry },
		options: RuntimeLocalUpdateOptions,
	): void;
}

type PresenceSubSchemaFromWorkspaceSchema<
	TSchema extends PresenceStatesSchema,
	Part extends keyof ReturnType<TSchema[keyof TSchema]>,
> = {
	[Key in keyof TSchema]: MapSchemaElement<TSchema, Part, Key>;
};

type MapEntries<TSchema extends PresenceStatesSchema> = PresenceSubSchemaFromWorkspaceSchema<
	TSchema,
	"manager"
>;

/**
 * ValueElementMap is a map of key to a map of clientId to ValueState.
 * It is not restricted to the schema of the map as it may receive updates from other clients
 * with managers that have not been registered locally. Each map node is responsible for keeping
 * all session's state to be able to pick arbitrary client to rebroadcast to others.
 *
 * This generic aspect makes some typing difficult. The loose typing is not broadcast to the
 * consumers that are expected to maintain their schema over multiple versions of clients.
 *
 * @internal
 */
export interface ValueElementMap<_TSchema extends PresenceStatesSchema> {
	[key: string]: ClientRecord<InternalTypes.ValueDirectoryOrState<unknown>>;
}

// An attempt to make the type more precise, but it is not working.
// If the casting in support code is too much we could keep two references to the same
// complete datastore, but with the respective types desired.
// type ValueElementMap<TSchema extends PresenceStatesNodeSchema> =
// 	| {
// 			[Key in keyof TSchema & string]?: {
// 				[ClientSessionId: ClientSessionId]: InternalTypes.ValueDirectoryOrState<MapSchemaElement<TSchema,"value",Key>>;
// 			};
// 	  }
// 	| {
// 			[key: string]: ClientRecord<InternalTypes.ValueDirectoryOrState<unknown>>;
// 	  };
// interface ValueElementMap<TValue> {
// 	[Id: string]: ClientRecord<InternalTypes.ValueDirectoryOrState<TValue>>;
// 	// Version with local packed in is convenient for map, but not for join broadcast to serialize simply.
// 	// [Id: string]: {
// 	// 	local: InternalTypes.ValueDirectoryOrState<TValue>;
// 	// 	all: ClientRecord<InternalTypes.ValueDirectoryOrState<TValue>>;
// 	// };
// }

/**
 * @internal
 */
export type ClientUpdateEntry = InternalTypes.ValueDirectoryOrState<unknown> & {
	ignoreUnmonitored?: true;
};

type ClientUpdateRecord = ClientRecord<ClientUpdateEntry>;

interface ValueUpdateRecord {
	[valueKey: string]: ClientUpdateRecord;
}

/**
 * @internal
 */
export interface PresenceStatesInternal {
	ensureContent<TSchemaAdditional extends PresenceStatesSchema>(
		content: TSchemaAdditional,
		controls: BroadcastControlSettings | undefined,
	): PresenceStates<TSchemaAdditional>;
	processUpdate(
		received: number,
		timeModifier: number,
		remoteDatastore: ValueUpdateRecord,
		senderConnectionId: ClientConnectionId,
	): void;
}

function isValueDirectory<
	T,
	TValueState extends
		| InternalTypes.ValueRequiredState<T>
		| InternalTypes.ValueOptionalState<T>,
>(
	value: InternalTypes.ValueDirectory<T> | TValueState,
): value is InternalTypes.ValueDirectory<T> {
	return "items" in value;
}

/**
 * Merge a value directory.
 *
 * @internal
 */
export function mergeValueDirectory<
	T,
	TValueState extends
		| InternalTypes.ValueRequiredState<T>
		| InternalTypes.ValueOptionalState<T>,
>(
	base: TValueState | InternalTypes.ValueDirectory<T> | undefined,
	update: TValueState | InternalTypes.ValueDirectory<T>,
	timeDelta: number,
): TValueState | InternalTypes.ValueDirectory<T> {
	if (!isValueDirectory(update)) {
		if (base === undefined || update.rev > base.rev) {
			return { ...update, timestamp: update.timestamp + timeDelta };
		}
		return base;
	}

	let mergeBase: InternalTypes.ValueDirectory<T>;
	if (base === undefined) {
		mergeBase = { rev: update.rev, items: {} };
	} else {
		const baseIsDirectory = isValueDirectory(base);
		if (base.rev >= update.rev) {
			if (!baseIsDirectory) {
				// base is leaf value that is more recent - nothing to do
				return base;
			}
			// While base has more advanced revision, assume mis-ordering or
			// missed and catchup update needs merged in.
			mergeBase = base;
		} else {
			mergeBase = { rev: update.rev, items: baseIsDirectory ? base.items : {} };
		}
	}
	for (const [key, value] of Object.entries(update.items)) {
		const baseElement:
			| InternalTypes.ValueDirectory<T>
			| InternalTypes.ValueOptionalState<T>
			| undefined = mergeBase.items[key];
		mergeBase.items[key] = mergeValueDirectory(baseElement, value, timeDelta);
	}
	return mergeBase;
}

/**
 * Updates remote state into the local [untracked] datastore.
 *
 * @param key - The key of the datastore to merge the untracked data into.
 * @param remoteAllKnownState - The remote state to merge into the datastore.
 * @param datastore - The datastore to merge the untracked data into.
 *
 * @remarks
 * In the case of ignored unmonitored data, the client entries are not stored,
 * though the value keys will be populated and often remain empty.
 *
 * @internal
 */
export function mergeUntrackedDatastore(
	key: string,
	remoteAllKnownState: ClientUpdateRecord,
	datastore: ValueElementMap<PresenceStatesSchema>,
	timeModifier: number,
): void {
	const localAllKnownState = getOrCreateRecord(
		datastore,
		key,
		(): RecordEntryTypes<typeof datastore> => ({}),
	);
	for (const [clientSessionId, value] of objectEntries(remoteAllKnownState)) {
		if (!("ignoreUnmonitored" in value)) {
			localAllKnownState[clientSessionId] = mergeValueDirectory(
				localAllKnownState[clientSessionId],
				value,
				timeModifier,
			);
		}
	}
}

/**
 * The default allowable update latency for PresenceStates workspaces in milliseconds.
 */
const defaultAllowableUpdateLatencyMs = 60;

/**
 * Produces the value type of a schema element or set of elements.
 */
type SchemaElementValueType<
	TSchema extends PresenceStatesSchema,
	Keys extends keyof TSchema & string,
> = Exclude<MapSchemaElement<TSchema, "initialData", Keys>, undefined>["value"];

class PresenceStatesImpl<TSchema extends PresenceStatesSchema>
	implements
		PresenceStatesInternal,
		PresenceStates<TSchema>,
		StateDatastore<
			keyof TSchema & string,
			SchemaElementValueType<TSchema, keyof TSchema & string>
		>
{
	private readonly nodes: MapEntries<TSchema>;
	public readonly props: PresenceStates<TSchema>["props"];

	public readonly controls: RequiredBroadcastControl;

	public constructor(
		private readonly runtime: PresenceRuntime,
		private readonly datastore: ValueElementMap<TSchema>,
		initialContent: TSchema,
		controlsSettings: BroadcastControlSettings | undefined,
	) {
		this.controls = new RequiredBroadcastControl(defaultAllowableUpdateLatencyMs);
		if (controlsSettings?.allowableUpdateLatencyMs !== undefined) {
			this.controls.allowableUpdateLatencyMs = controlsSettings.allowableUpdateLatencyMs;
		}

		// Prepare initial map content from initial state
		{
			const clientSessionId = this.runtime.clientSessionId;
			// Empty record does not satisfy the type, but nodes will post loop.
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			const nodes = {} as MapEntries<TSchema>;
			let anyInitialValues = false;
			const newValues: { [key: string]: InternalTypes.ValueDirectoryOrState<unknown> } = {};
			let cumulativeAllowableUpdateLatencyMs: number | undefined;
			for (const [key, nodeFactory] of Object.entries(initialContent)) {
				const newNodeData = nodeFactory(key, handleFromDatastore(this));
				nodes[key as keyof TSchema] = newNodeData.manager;
				if ("initialData" in newNodeData) {
					const { value, allowableUpdateLatencyMs } = newNodeData.initialData;
					datastore[key] ??= {};
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					datastore[key]![clientSessionId] = value;
					newValues[key] = value;
					if (allowableUpdateLatencyMs !== undefined) {
						cumulativeAllowableUpdateLatencyMs =
							cumulativeAllowableUpdateLatencyMs === undefined
								? allowableUpdateLatencyMs
								: Math.min(cumulativeAllowableUpdateLatencyMs, allowableUpdateLatencyMs);
					}
					anyInitialValues = true;
				}
			}
			this.nodes = nodes;
			// props is the public view of nodes that limits the entries types to
			// the public interface of the value manager with an additional type
			// filter that beguiles the type system. So just reinterpret cast.
			this.props = this.nodes as unknown as PresenceStates<TSchema>["props"];

			if (anyInitialValues) {
				this.runtime.localUpdate(newValues, {
					allowableUpdateLatencyMs:
						cumulativeAllowableUpdateLatencyMs ?? this.controls.allowableUpdateLatencyMs,
				});
			}
		}
	}

	public knownValues<Key extends keyof TSchema & string>(
		key: Key,
	): {
		self: ClientSessionId | undefined;
		states: ClientRecord<SchemaElementValueType<TSchema, Key>>;
	} {
		return {
			self: this.runtime.clientSessionId,
			states: this.datastore[key],
		};
	}

	public localUpdate<Key extends keyof TSchema & string>(
		key: Key,
		value: SchemaElementValueType<TSchema, Key> & ClientUpdateEntry,
		options: LocalStateUpdateOptions,
	): void {
		this.runtime.localUpdate(
			{ [key]: value },
			{
				...options,
				allowableUpdateLatencyMs:
					options.allowableUpdateLatencyMs ?? this.controls.allowableUpdateLatencyMs,
			},
		);
	}

	public update<Key extends keyof TSchema & string>(
		key: Key,
		clientId: ClientSessionId,
		value: Exclude<MapSchemaElement<TSchema, "initialData", Key>, undefined>["value"],
	): void {
		// Callers my only use `key`s that are part of `this.datastore`.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const allKnownState = this.datastore[key]!;
		allKnownState[clientId] = mergeValueDirectory(allKnownState[clientId], value, 0);
	}

	public lookupClient(clientId: ClientConnectionId): ISessionClient {
		return this.runtime.lookupClient(clientId);
	}

	public add<
		TKey extends string,
		TValue extends InternalTypes.ValueDirectoryOrState<unknown>,
		TValueManager,
	>(
		key: TKey,
		nodeFactory: InternalTypes.ManagerFactory<TKey, TValue, TValueManager>,
	): asserts this is PresenceStates<
		TSchema & Record<TKey, InternalTypes.ManagerFactory<TKey, TValue, TValueManager>>
	> {
		assert(!(key in this.nodes), 0xa3c /* Already have entry for key in map */);
		const nodeData = nodeFactory(key, handleFromDatastore(this));
		this.nodes[key] = nodeData.manager;
		if ("initialData" in nodeData) {
			const { value, allowableUpdateLatencyMs } = nodeData.initialData;
			if (key in this.datastore) {
				// Already have received state from other clients. Kept in `all`.
				// TODO: Send current `all` state to state manager.
			} else {
				this.datastore[key] = {};
			}
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.datastore[key]![this.runtime.clientSessionId] = value;
			this.runtime.localUpdate(
				{ [key]: value },
				{
					allowableUpdateLatencyMs:
						allowableUpdateLatencyMs ?? this.controls.allowableUpdateLatencyMs,
				},
			);
		}
	}

	public ensureContent<TSchemaAdditional extends PresenceStatesSchema>(
		content: TSchemaAdditional,
		controls: BroadcastControlSettings | undefined,
	): PresenceStates<TSchema & TSchemaAdditional> {
		if (controls?.allowableUpdateLatencyMs !== undefined) {
			this.controls.allowableUpdateLatencyMs = controls.allowableUpdateLatencyMs;
		}
		for (const [key, nodeFactory] of Object.entries(content)) {
			if (key in this.nodes) {
				const node = unbrandIVM(this.nodes[key]);
				if (!(node instanceof nodeFactory.instanceBase)) {
					throw new TypeError(`State "${key}" previously created by different value manager.`);
				}
			} else {
				this.add(key, nodeFactory);
			}
		}
		return this as PresenceStates<TSchema & TSchemaAdditional>;
	}

	public processUpdate(
		received: number,
		timeModifier: number,
		remoteDatastore: ValueUpdateRecord,
	): void {
		for (const [key, remoteAllKnownState] of Object.entries(remoteDatastore)) {
			if (key in this.nodes) {
				const node = unbrandIVM(this.nodes[key]);
				for (const [clientSessionId, value] of objectEntries(remoteAllKnownState)) {
					const client = this.runtime.lookupClient(clientSessionId);
					node.update(client, received, value);
				}
			} else {
				// Assume all broadcast state is meant to be kept even if not currently registered.
				mergeUntrackedDatastore(key, remoteAllKnownState, this.datastore, timeModifier);
			}
		}
	}
}

/**
 * Create a new PresenceStates using the DataStoreRuntime provided.
 * @param initialContent - The initial value managers to register.
 */
export function createPresenceStates<TSchema extends PresenceStatesSchema>(
	runtime: PresenceRuntime,
	datastore: ValueElementMap<PresenceStatesSchema>,
	initialContent: TSchema,
	controls: BroadcastControlSettings | undefined,
): { public: PresenceStates<TSchema>; internal: PresenceStatesInternal } {
	const impl = new PresenceStatesImpl<TSchema>(runtime, datastore, initialContent, controls);

	return {
		public: impl,
		internal: impl,
	};
}
