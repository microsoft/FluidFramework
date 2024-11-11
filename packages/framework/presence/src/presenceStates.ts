/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { ClientRecord } from "./internalTypes.js";
import { brandedObjectEntries } from "./internalTypes.js";
import type { ClientSessionId, ISessionClient } from "./presence.js";
import { handleFromDatastore, type StateDatastore } from "./stateDatastore.js";
import type { PresenceStates, PresenceStatesSchema } from "./types.js";
import { unbrandIVM } from "./valueManager.js";

/**
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
export interface PresenceRuntime {
	readonly clientSessionId: ClientSessionId;
	lookupClient(clientId: ClientConnectionId): ISessionClient;
	localUpdate(states: { [key: string]: ClientUpdateEntry }, forceBroadcast: boolean): void;
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
 * all sessions state to be able to pick arbitrary client to rebroadcast to others.
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
	): PresenceStates<TSchemaAdditional>;
	processUpdate(
		received: number,
		timeModifier: number,
		remoteDatastore: ValueUpdateRecord,
		senderConnectionId?: ClientConnectionId,
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

function mergeValueDirectory<
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
		const baseElement = mergeBase.items[key];
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
	if (!(key in datastore)) {
		datastore[key] = {};
	}
	const localAllKnownState = datastore[key];
	for (const [clientSessionId, value] of brandedObjectEntries(remoteAllKnownState)) {
		if (!("ignoreUnmonitored" in value)) {
			localAllKnownState[clientSessionId] = mergeValueDirectory(
				localAllKnownState[clientSessionId],
				value,
				timeModifier,
			);
		}
	}
}

class PresenceStatesImpl<TSchema extends PresenceStatesSchema>
	implements
		PresenceStatesInternal,
		PresenceStates<TSchema>,
		StateDatastore<
			keyof TSchema & string,
			MapSchemaElement<TSchema, "value", keyof TSchema & string>
		>
{
	private readonly nodes: MapEntries<TSchema>;
	public readonly props: PresenceStates<TSchema>["props"];

	public constructor(
		private readonly runtime: PresenceRuntime,
		private readonly datastore: ValueElementMap<TSchema>,
		initialContent: TSchema,
	) {
		// Prepare initial map content from initial state
		{
			const clientSessionId = this.runtime.clientSessionId;
			let anyInitialValues = false;
			// eslint-disable-next-line unicorn/no-array-reduce
			const initial = Object.entries(initialContent).reduce(
				(acc, [key, nodeFactory]) => {
					const newNodeData = nodeFactory(key, handleFromDatastore(this));
					acc.nodes[key as keyof TSchema] = newNodeData.manager;
					if ("value" in newNodeData) {
						acc.datastore[key] = acc.datastore[key] ?? {};
						acc.datastore[key][clientSessionId] = newNodeData.value;
						acc.newValues[key] = newNodeData.value;
						anyInitialValues = true;
					}
					return acc;
				},
				{
					// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
					nodes: {} as MapEntries<TSchema>,
					datastore,
					// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
					newValues: {} as { [key: string]: InternalTypes.ValueDirectoryOrState<unknown> },
				},
			);
			this.nodes = initial.nodes;
			// props is the public view of nodes that limits the entries types to
			// the public interface of the value manager with an additional type
			// filter that beguiles the type system. So just reinterpret cast.
			this.props = this.nodes as unknown as PresenceStates<TSchema>["props"];

			if (anyInitialValues) {
				this.runtime.localUpdate(initial.newValues, false);
			}
		}
	}

	public knownValues<Key extends keyof TSchema & string>(
		key: Key,
	): {
		self: ClientSessionId | undefined;
		states: ClientRecord<MapSchemaElement<TSchema, "value", Key>>;
	} {
		return {
			self: this.runtime.clientSessionId,
			states: this.datastore[key],
		};
	}

	public localUpdate<Key extends keyof TSchema & string>(
		key: Key,
		value: MapSchemaElement<TSchema, "value", Key> & ClientUpdateEntry,
		forceBroadcast: boolean,
	): void {
		this.runtime.localUpdate({ [key]: value }, forceBroadcast);
	}

	public update<Key extends keyof TSchema & string>(
		key: Key,
		clientId: ClientSessionId,
		value: Exclude<MapSchemaElement<TSchema, "value", Key>, undefined>,
	): void {
		const allKnownState = this.datastore[key];
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
		if ("value" in nodeData) {
			if (key in this.datastore) {
				// Already have received state from other clients. Kept in `all`.
				// TODO: Send current `all` state to state manager.
			} else {
				this.datastore[key] = {};
			}
			this.datastore[key][this.runtime.clientSessionId] = nodeData.value;
			this.runtime.localUpdate({ [key]: nodeData.value }, false);
		}
	}

	public ensureContent<TSchemaAdditional extends PresenceStatesSchema>(
		content: TSchemaAdditional,
	): PresenceStates<TSchema & TSchemaAdditional> {
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
				for (const [clientSessionId, value] of brandedObjectEntries(remoteAllKnownState)) {
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
): { public: PresenceStates<TSchema>; internal: PresenceStatesInternal } {
	const impl = new PresenceStatesImpl<TSchema>(runtime, datastore, initialContent);

	return {
		public: impl,
		internal: impl,
	};
}
