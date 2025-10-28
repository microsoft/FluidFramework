/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type { BroadcastControlSettings } from "./broadcastControls.js";
import { RequiredBroadcastControl } from "./broadcastControls.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type {
	ClientRecord,
	PostUpdateAction,
	ValidatableOptionalState,
	ValidatableRequiredState,
	ValidatableValueDirectory,
	ValidatableValueDirectoryOrState,
	ValidatableValueStructure,
} from "./internalTypes.js";
import type { RecordEntryTypes } from "./internalUtils.js";
import { getOrCreateRecord, objectEntries } from "./internalUtils.js";
import type { AttendeeId, PresenceWithNotifications as Presence } from "./presence.js";
import type { LocalStateUpdateOptions, StateDatastore } from "./stateDatastore.js";
import { handleFromDatastore } from "./stateDatastore.js";
import type { AnyWorkspace, StatesWorkspace, StatesWorkspaceSchema } from "./types.js";
import { unbrandIVM } from "./valueManager.js";

/**
 * Extracts `Part` from {@link InternalTypes.ManagerFactory} return type
 * matching the {@link StatesWorkspaceSchema} `Keys` given.
 *
 * @remarks
 * If the `Part` is an optional property, undefined will be included in the
 * result. Applying `Required` to the return type prior to extracting `Part`
 * does not work as expected. Exclude\<, undefined\> can be used as needed.
 */
export type MapSchemaElement<
	TSchema extends StatesWorkspaceSchema,
	Part extends keyof ReturnType<TSchema[keyof TSchema]>,
	Keys extends keyof TSchema = keyof TSchema,
> = ReturnType<TSchema[Keys]>[Part];

/**
 * Miscellaneous options for local state updates
 */
export interface RuntimeLocalUpdateOptions {
	/**
	 * The maximum time in milliseconds that this update is allowed to be
	 * delayed before it must be sent to the service.
	 */
	allowableUpdateLatencyMs: number;

	/**
	 * Special option allowed for unicast notifications.
	 */
	targetClientId?: ClientConnectionId;
}

/**
 * Contract for `PresenceDatastoreManager` as required by States Workspaces ({@link PresenceStatesImpl}).
 */
export interface PresenceRuntime {
	readonly presence: Presence;
	readonly attendeeId: AttendeeId;
	localUpdate(
		states: { [key: string]: ClientUpdateEntry },
		options: RuntimeLocalUpdateOptions,
	): void;
}

type PresenceSubSchemaFromWorkspaceSchema<
	TSchema extends StatesWorkspaceSchema,
	Part extends keyof ReturnType<TSchema[keyof TSchema]>,
> = {
	[Key in keyof TSchema]: MapSchemaElement<TSchema, Part, Key>;
};

type MapEntries<TSchema extends StatesWorkspaceSchema> = PresenceSubSchemaFromWorkspaceSchema<
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
 */
export interface ValueElementMap<_TSchema extends StatesWorkspaceSchema> {
	[key: string]: ClientRecord<ValidatableValueDirectoryOrState<unknown>>;
}

// An attempt to make the type more precise, but it is not working.
// If the casting in support code is too much we could keep two references to the same
// complete datastore, but with the respective types desired.
// type ValueElementMap<TSchema extends PresenceStatesNodeSchema> =
// 	| {
// 			[Key in keyof TSchema & string]?: {
// 				[AttendeeId: AttendeeId]: InternalTypes.ValueDirectoryOrState<MapSchemaElement<TSchema,"value",Key>>;
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
 * Data content of a datastore entry in update messages
 */
export type ClientUpdateEntry = InternalTypes.ValueDirectoryOrState<unknown> & {
	ignoreUnmonitored?: true;
};

interface ClientUpdateRecord {
	[AttendeeId: AttendeeId]: ClientUpdateEntry;
}

interface ValueUpdateRecord {
	[valueKey: string]: ClientUpdateRecord;
}

/**
 * Contract for Workspaces as required by `PresenceDatastoreManager`
 */
export interface PresenceStatesInternal {
	ensureContent<TSchemaAdditional extends StatesWorkspaceSchema>(
		content: TSchemaAdditional,
		controls: BroadcastControlSettings | undefined,
	): AnyWorkspace<TSchemaAdditional>;
	processUpdate(
		received: number,
		timeModifier: number,
		remoteDatastore: ValueUpdateRecord,
		senderConnectionId: ClientConnectionId,
	): PostUpdateAction[];
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

// function overloads
// Non-validatable types
export function mergeValueDirectory<
	T,
	TValueState extends
		| InternalTypes.ValueRequiredState<T>
		| InternalTypes.ValueOptionalState<T>,
>(
	base: TValueState | InternalTypes.ValueDirectory<T> | undefined,
	update: TValueState | InternalTypes.ValueDirectory<T>,
	timeDelta: number,
): TValueState | InternalTypes.ValueDirectory<T>;
// Validatable base type with non-validatable update types
export function mergeValueDirectory<
	T,
	TBaseState extends ValidatableRequiredState<T> | ValidatableOptionalState<T>,
	TUpdateState extends
		| InternalTypes.ValueRequiredState<T>
		| InternalTypes.ValueOptionalState<T>,
>(
	base: TBaseState | ValidatableValueDirectory<T> | undefined,
	update: TUpdateState | InternalTypes.ValueDirectory<T>,
	timeDelta: number,
): TBaseState | ValidatableValueDirectory<T>;
// Fully validatable types
export function mergeValueDirectory<
	T,
	TValueState extends ValidatableRequiredState<T> | ValidatableOptionalState<T>,
>(
	base: TValueState | ValidatableValueDirectory<T> | undefined,
	update: TValueState | ValidatableValueDirectory<T>,
	timeDelta: number,
): TValueState | ValidatableValueDirectory<T>;
/**
 * Merge a value directory.
 *
 * @privateRemarks
 * This implementation uses the InternalTypes set of Value types but it is
 * agnostic so long as the validatable versions don't start requiring
 * properties.
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
 */
export function mergeUntrackedDatastore(
	key: string,
	remoteAllKnownState: ClientUpdateRecord,
	datastore: ValueElementMap<StatesWorkspaceSchema>,
	timeModifier: number,
): void {
	const localAllKnownState = getOrCreateRecord(
		datastore,
		key,
		(): RecordEntryTypes<typeof datastore> => ({}),
	);
	for (const [attendeeId, value] of objectEntries(remoteAllKnownState)) {
		if (!("ignoreUnmonitored" in value)) {
			localAllKnownState[attendeeId] = mergeValueDirectory(
				localAllKnownState[attendeeId],
				value,
				timeModifier,
			);
		}
	}
}

/**
 * The default allowable update latency for StatesWorkspace in milliseconds.
 */
const defaultAllowableUpdateLatencyMs = 60;

/**
 * Produces the value type of a schema element or set of elements.
 */
type SchemaElementValueType<
	TSchema extends StatesWorkspaceSchema,
	Keys extends keyof TSchema,
> = Exclude<MapSchemaElement<TSchema, "initialData", Keys>, undefined>["value"];

/**
 * No-runtime-effect helper to protect cast from unknown datastore to specific
 * schema record type. (It is up to consumer to check that record conforms to
 * expectations.)
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function castUnknownRecordToSchemaRecord<
	TSchema extends StatesWorkspaceSchema,
	Key extends keyof TSchema & string,
>(record: ClientRecord<ValidatableValueDirectoryOrState<unknown>>) {
	return record as ClientRecord<
		ValidatableValueStructure<SchemaElementValueType<TSchema, Key>>
	>;
}

class PresenceStatesImpl<TSchema extends StatesWorkspaceSchema>
	implements
		PresenceStatesInternal,
		AnyWorkspace<TSchema>,
		StateDatastore<
			keyof TSchema & string,
			SchemaElementValueType<TSchema, keyof TSchema & string>
		>
{
	private readonly nodes: MapEntries<TSchema>;
	public readonly states: StatesWorkspace<TSchema>["states"];
	public readonly notifications: AnyWorkspace<TSchema>["notifications"];

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
			const attendeeId = this.runtime.attendeeId;
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
					(datastore[key] ??= {})[attendeeId] = value;
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
			// states and notifications are the public view of nodes that limits the entries
			// types to the public interface of State objects with an additional type
			// filter that beguiles the type system. So just reinterpret cast.
			const properties = nodes as unknown as AnyWorkspace<TSchema>["states"];
			// `AnyWorkspace` support comes from defining both `states` for
			// `StatesWorkspace` and `notifications` for `NotificationsWorkspace`.
			// `notifications` is always a subset of what `states` can be; so the same.
			this.notifications = this.states = properties;

			if (anyInitialValues) {
				this.runtime.localUpdate(newValues, {
					allowableUpdateLatencyMs:
						cumulativeAllowableUpdateLatencyMs ?? this.controls.allowableUpdateLatencyMs,
				});
			}
		}
	}

	public get presence(): Presence {
		return this.runtime.presence;
	}

	public knownValues<Key extends keyof TSchema & string>(
		key: Key,
	): {
		self: AttendeeId | undefined;
		states: ClientRecord<ValidatableValueStructure<SchemaElementValueType<TSchema, Key>>>;
	} {
		return {
			self: this.runtime.attendeeId,
			// Caller must only use `key`s that are part of `this.datastore`.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			states: castUnknownRecordToSchemaRecord(this.datastore[key]!),
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
		clientId: AttendeeId,
		value: ValidatableValueDirectoryOrState<unknown>,
	): void {
		// Callers my only use `key`s that are part of `this.datastore`.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const allKnownState = this.datastore[key]!;
		allKnownState[clientId] = mergeValueDirectory<unknown, ValidatableRequiredState<unknown>>(
			allKnownState[clientId],
			value,
			0,
		);
	}

	public add<
		TKey extends string,
		TValue extends InternalTypes.ValueDirectoryOrState<unknown>,
		TValueManager,
	>(
		key: TKey,
		nodeFactory: InternalTypes.ManagerFactory<TKey, TValue, TValueManager>,
	): asserts this is StatesWorkspace<
		TSchema & Record<TKey, InternalTypes.ManagerFactory<TKey, TValue, TValueManager>>
	> {
		assert(!(key in this.nodes), 0xa3c /* Already have entry for key in map */);
		const nodeData = nodeFactory(key, handleFromDatastore(this));
		this.nodes[key] = nodeData.manager;
		if ("initialData" in nodeData) {
			const { value, allowableUpdateLatencyMs } = nodeData.initialData;
			let datastoreValue = this.datastore[key];
			if (datastoreValue === undefined) {
				datastoreValue = this.datastore[key] = {};
			} else {
				// Already have received state from other clients. Kept in `all`.
				// TODO: Send current `all` state to state manager.
			}
			datastoreValue[this.runtime.attendeeId] = value;
			this.runtime.localUpdate(
				{ [key]: value },
				{
					allowableUpdateLatencyMs:
						allowableUpdateLatencyMs ?? this.controls.allowableUpdateLatencyMs,
				},
			);
		}
	}

	public ensureContent<TSchemaAdditional extends StatesWorkspaceSchema>(
		content: TSchemaAdditional,
		controls: BroadcastControlSettings | undefined,
	): AnyWorkspace<TSchema & TSchemaAdditional> {
		if (controls?.allowableUpdateLatencyMs !== undefined) {
			this.controls.allowableUpdateLatencyMs = controls.allowableUpdateLatencyMs;
		}
		for (const [key, nodeFactory] of Object.entries(content)) {
			const brandedIVM = this.nodes[key];
			if (brandedIVM === undefined) {
				this.add(key, nodeFactory);
			} else {
				const node = unbrandIVM(brandedIVM);
				if (!(node instanceof nodeFactory.instanceBase)) {
					throw new TypeError(`State "${key}" previously created by different State object.`);
				}
			}
		}
		return this as AnyWorkspace<TSchema & TSchemaAdditional>;
	}

	public processUpdate(
		received: number,
		timeModifier: number,
		remoteDatastore: ValueUpdateRecord,
	): PostUpdateAction[] {
		const postUpdateActions: PostUpdateAction[] = [];
		for (const [key, remoteAllKnownState] of Object.entries(remoteDatastore)) {
			const brandedIVM = this.nodes[key];
			if (brandedIVM === undefined) {
				// Assume all broadcast state is meant to be kept even if not currently registered.
				mergeUntrackedDatastore(key, remoteAllKnownState, this.datastore, timeModifier);
			} else {
				const node = unbrandIVM(brandedIVM);
				for (const [attendeeId, value] of objectEntries(remoteAllKnownState)) {
					const client = this.runtime.presence.attendees.getAttendee(attendeeId);
					postUpdateActions.push(...node.update(client, received, value));
				}
			}
		}
		return postUpdateActions;
	}
}

/**
 * Create a new Workspace using the DataStoreRuntime provided.
 * @param initialContent - The initial State objects to register.
 */
export function createPresenceStates<TSchema extends StatesWorkspaceSchema>(
	runtime: PresenceRuntime,
	datastore: ValueElementMap<StatesWorkspaceSchema>,
	initialContent: TSchema,
	controls: BroadcastControlSettings | undefined,
): { public: AnyWorkspace<TSchema>; internal: PresenceStatesInternal } {
	const impl = new PresenceStatesImpl<TSchema>(runtime, datastore, initialContent, controls);

	return {
		public: impl,
		internal: impl,
	};
}
