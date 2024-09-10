/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";

import type { ConnectedClientId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { ClientRecord } from "./internalTypes.js";
import type { IPresence, ISessionClient } from "./presence.js";
import type { IEphemeralRuntime } from "./presenceManager.js";
import { handleFromDatastore, type StateDatastore } from "./stateDatastore.js";
import type { PresenceStates, PresenceStatesMethods, PresenceStatesSchema } from "./types.js";
import { unbrandIVM } from "./valueManager.js";

type MapSchemaElement<
	TSchema extends PresenceStatesSchema,
	Part extends keyof ReturnType<TSchema[keyof TSchema]>,
	Keys extends keyof TSchema = keyof TSchema,
> = ReturnType<TSchema[Keys]>[Part];

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
 */
interface ValueElementMap<_TSchema extends PresenceStatesSchema> {
	[key: string]: ClientRecord<InternalTypes.ValueDirectoryOrState<unknown>>;
}
// An attempt to make the type more precise, but it is not working.
// If the casting in support code is too much we could keep two references to the same
// complete datastore, but with the respective types desired.
// type ValueElementMap<TSchema extends PresenceStatesNodeSchema> =
// 	| {
// 			[Key in keyof TSchema & string]?: {
// 				[ClientId: ClientId]: InternalTypes.ValueDirectoryOrState<MapSchemaElement<TSchema,"value",Key>>;
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

interface GeneralDatastoreMessageContent {
	[PresenceStatesKey: string]: {
		[StateValueManagerKey: string]: {
			[ClientId: ConnectedClientId]: InternalTypes.ValueDirectoryOrState<unknown> & {
				keepUnregistered?: true;
			};
		};
	};
}

interface SystemDatastore {
	"system:map": {
		priorClientIds: {
			[ClientId: ConnectedClientId]: InternalTypes.ValueRequiredState<ConnectedClientId[]>;
		};
	};
}

type DatastoreMessageContent = GeneralDatastoreMessageContent & SystemDatastore;

interface DatastoreUpdateMessage extends IInboundSignalMessage {
	type: "DIS:DatastoreUpdate";
	content: {
		sendTimestamp: number;
		avgLatency: number;
		isComplete?: true;
		data: GeneralDatastoreMessageContent & Partial<SystemDatastore>;
	};
}

interface ClientJoinMessage extends IInboundSignalMessage {
	type: "DIS:ClientJoin";
	content: {
		updateProviders: ConnectedClientId[];
		sendTimestamp: number;
		avgLatency: number;
		data: DatastoreMessageContent;
	};
}

function isDISMessage(
	message: IInboundSignalMessage,
): message is DatastoreUpdateMessage | ClientJoinMessage {
	return message.type.startsWith("DIS:");
}

/**
 * @internal
 */
export interface PresenceStatesInternal {
	ensureContent<TSchemaAdditional extends PresenceStatesSchema>(
		content: TSchemaAdditional,
	): PresenceStates<TSchemaAdditional>;
	processSignal(message: IInboundSignalMessage, local: boolean): void;
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

class PresenceStatesImpl<TSchema extends PresenceStatesSchema>
	implements
		PresenceStatesInternal,
		PresenceStatesMethods<TSchema, unknown>,
		StateDatastore<
			keyof TSchema & string,
			MapSchemaElement<TSchema, "value", keyof TSchema & string>
		>
{
	private readonly datastore: ValueElementMap<TSchema> = {};
	public readonly nodes: MapEntries<TSchema>;
	private averageLatency = 0;
	private returnedMessages = 0;
	private refreshBroadcastRequested = false;

	public constructor(
		private readonly manager: IPresence,
		private readonly runtime: IEphemeralRuntime,
		initialContent: TSchema,
	) {
		this.runtime.getAudience().on("addMember", (clientId) => {
			for (const [_key, allKnownState] of Object.entries(this.datastore)) {
				assert(!(clientId in allKnownState), "New client already in workspace");
			}
			// TODO: Send all current state to the new client
		});
		runtime.on("disconnected", () => {
			const { clientId } = this.runtime;
			assert(clientId !== undefined, "Disconnected without local clientId");
			for (const [_key, allKnownState] of Object.entries(this.datastore)) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete allKnownState[clientId];
			}
			// TODO: Consider caching prior (current) clientId to broadcast when reconnecting so others may remap state.
		});
		runtime.on("connected", () => {
			const { clientId } = this.runtime;
			assert(clientId !== undefined, "Connected without local clientId");
			for (const [key, allKnownState] of Object.entries(this.datastore)) {
				if (key in this.nodes) {
					allKnownState[clientId] = unbrandIVM(this.nodes[key]).value;
				}
			}
		});
		runtime.on("signal", this.processSignal.bind(this));

		// Prepare initial map content from initial state
		{
			const clientId = this.runtime.clientId;
			// eslint-disable-next-line unicorn/no-array-reduce
			const initial = Object.entries(initialContent).reduce(
				(acc, [key, nodeFactory]) => {
					const newNodeData = nodeFactory(key, handleFromDatastore(this));
					acc.nodes[key as keyof TSchema] = newNodeData.manager;
					acc.datastore[key] = {};
					if (clientId !== undefined && clientId) {
						acc.datastore[key][clientId] = newNodeData.value;
					}
					return acc;
				},
				{
					nodes: {} as unknown as MapEntries<TSchema>,
					datastore: {} as unknown as ValueElementMap<TSchema>,
				},
			);
			this.nodes = initial.nodes;
			this.datastore = initial.datastore;
		}
	}

	public knownValues<Key extends keyof TSchema & string>(
		key: Key,
	): {
		self: string | undefined;
		states: ClientRecord<MapSchemaElement<TSchema, "value", Key>>;
	} {
		return {
			self: this.runtime.clientId,
			states: this.datastore[key],
		};
	}

	public localUpdate<Key extends keyof TSchema & string>(
		key: Key,
		value: MapSchemaElement<TSchema, "value", Key>,
		_forceBroadcast: boolean,
	): void {
		const clientId = this.runtime.clientId;
		if (clientId === undefined) {
			return;
		}
		const content = {
			sendTimestamp: Date.now(),
			avgLatency: this.averageLatency,
			// isComplete: false,
			data: {
				"<unused>": {
					[key]: { [clientId]: value },
				},
			},
		} satisfies DatastoreUpdateMessage["content"];
		this.runtime.submitSignal("DIS:DatastoreUpdate", content);
	}

	public update<Key extends keyof TSchema & string>(
		key: Key,
		clientId: string,
		value: MapSchemaElement<TSchema, "value", Key>,
	): void {
		const allKnownState = this.datastore[key];
		allKnownState[clientId] = mergeValueDirectory(allKnownState[clientId], value, 0);
	}

	public lookupClient(clientId: ConnectedClientId): ISessionClient {
		return this.manager.getAttendee(clientId);
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
		assert(!(key in this.nodes), "Already have entry for key in map");
		const nodeData = nodeFactory(key, handleFromDatastore(this));
		this.nodes[key] = nodeData.manager;
		if (key in this.datastore) {
			// Already have received state from other clients. Kept in `all`.
			// TODO: Send current `all` state to state manager.
		} else {
			this.datastore[key] = {};
		}
		// If we have a clientId, then add the local state entry to the all state.
		const { clientId } = this.runtime;
		if (clientId !== undefined && clientId) {
			this.datastore[key][clientId] = nodeData.value;
		}
	}

	public ensureContent<TSchemaAdditional extends PresenceStatesSchema>(
		content: TSchemaAdditional,
	): PresenceStates<TSchema & TSchemaAdditional> {
		for (const [key, nodeFactory] of Object.entries(content)) {
			this.add(key, nodeFactory);
		}
		return this as PresenceStates<TSchema & TSchemaAdditional>;
	}

	private broadcastAllKnownState(): void {
		this.runtime.submitSignal("DIS:DatastoreUpdate", {
			sendTimestamp: Date.now(),
			avgLatency: this.averageLatency,
			isComplete: true,
			data: { "<unused>": this.datastore },
		} satisfies DatastoreUpdateMessage["content"]);
		this.refreshBroadcastRequested = false;
	}

	public processSignal(
		message: IInboundSignalMessage | DatastoreUpdateMessage | ClientJoinMessage,
		local: boolean,
	): void {
		const received = Date.now();
		assert(message.clientId !== null, "Map received signal without clientId");
		if (!isDISMessage(message)) {
			return;
		}
		if (local) {
			const deliveryDelta = received - message.content.sendTimestamp;
			this.returnedMessages = Math.min(this.returnedMessages + 1, 256);
			this.averageLatency =
				(this.averageLatency * (this.returnedMessages - 1) + deliveryDelta) /
				this.returnedMessages;
			return;
		}

		const timeModifier =
			received -
			(this.averageLatency + message.content.avgLatency + message.content.sendTimestamp);

		if (message.type === "DIS:ClientJoin") {
			const updateProviders = message.content.updateProviders;
			this.refreshBroadcastRequested = true;
			// We must be connected to receive this message, so clientId should be defined.
			// If it isn't then, not really a problem; just won't be in provider list.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			if (updateProviders.includes(this.runtime.clientId!)) {
				// Send all current state to the new client
				this.broadcastAllKnownState();
			} else {
				// Schedule a broadcast to the new client after a delay only to send if
				// another broadcast hasn't been seen in the meantime. The delay is based
				// on the position in the audience list. It doesn't have to be a stable
				// list across all clients. We need something to provide suggested order
				// to prevent a flood of broadcasts.
				let indexOfSelf = 0;
				for (const clientId of this.runtime.getAudience().getMembers().keys()) {
					if (clientId === this.runtime.clientId) {
						break;
					}
					indexOfSelf += 1;
				}
				const waitTime = indexOfSelf * 20 + 200;
				setTimeout(() => {
					if (this.refreshBroadcastRequested) {
						this.broadcastAllKnownState();
					}
				}, waitTime);
			}
		} else {
			assert(message.type === "DIS:DatastoreUpdate", "Unexpected message type");
			if (message.content.isComplete) {
				this.refreshBroadcastRequested = false;
			}
		}
		for (const mapData of Object.values(message.content.data)) {
			const remoteDatastore = mapData as ValueElementMap<TSchema>;
			for (const [key, remoteAllKnownState] of Object.entries(remoteDatastore)) {
				if (key in this.nodes) {
					const node = unbrandIVM(this.nodes[key]);
					for (const [clientId, value] of Object.entries(remoteAllKnownState)) {
						const client = this.manager.getAttendee(clientId);
						node.update(client, received, value);
					}
				} else {
					// Assume all broadcast state is meant to be kept even if not currently registered.
					if (!(key in this.datastore)) {
						this.datastore[key] = {};
					}
					const localAllKnownState = this.datastore[key];
					for (const [clientId, value] of Object.entries(remoteAllKnownState)) {
						localAllKnownState[clientId] = mergeValueDirectory(
							localAllKnownState[clientId],
							value,
							timeModifier,
						);
					}
				}
			}
		}
	}
}

/**
 * Create a new PresenceStates using the DataStoreRuntime provided.
 * @param runtime - The dedicated runtime to use for the PresenceStates. The requirements
 * are very unstable and will change. Recommendation is to use PresenceStatesFactory from
 * `alpha` entrypoint for now.
 * @param initialContent - The initial value managers to register.
 */
export function createPresenceStates<TSchema extends PresenceStatesSchema>(
	manager: IPresence,
	runtime: IEphemeralRuntime,
	initialContent: TSchema,
): { public: PresenceStates<TSchema>; internal: PresenceStatesInternal } {
	const impl = new PresenceStatesImpl(manager, runtime, initialContent);

	// Capture the top level "public" map. Both the map implementation and
	// the wrapper object reference this object.
	const nodes = impl.nodes;

	// Create a wrapper object that has just the public interface methods and nothing more.
	const wrapper = {
		add: impl.add.bind(impl),
	};

	return {
		public: new Proxy(wrapper as PresenceStates<TSchema>, {
			get(target, p, receiver): unknown {
				if (typeof p === "string") {
					return target[p] ?? nodes[p];
				}
				return Reflect.get(target, p, receiver);
			},
			set(_target, _p, _newValue, _receiver): false {
				return false;
			},
		}),
		internal: impl,
	};
}
