/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createSessionId } from "@fluidframework/id-compressor/internal";

import type { ClientConnectionId } from "./baseTypes.js";
import type {
	ClientSessionId,
	IPresence,
	ISessionClient,
	PresenceEvents,
} from "./presence.js";
import type {
	IEphemeralRuntime,
	PresenceDatastoreManager,
} from "./presenceDatastoreManager.js";
import { PresenceDatastoreManagerImpl } from "./presenceDatastoreManager.js";
import type {
	PresenceStates,
	PresenceWorkspaceAddress,
	PresenceStatesSchema,
} from "./types.js";

import type {
	IContainerExtension,
	IExtensionMessage,
} from "@fluid-experimental/presence/internal/container-definitions/internal";
import { createEmitter } from "@fluid-experimental/presence/internal/events";

/**
 * @internal
 */
export interface IPresenceManager
	extends IPresence,
		Pick<Required<IContainerExtension<[]>>, "processSignal"> {}

/**
 * The Presence manager
 */
class PresenceManager implements IPresenceManager {
	private readonly datastoreManager: PresenceDatastoreManager;
	private readonly selfAttendee: ISessionClient = {
		sessionId: createSessionId() as ClientSessionId,
		currentConnectionId: () => {
			throw new Error("Client has never been connected");
		},
	};
	private readonly attendees = new Map<ClientConnectionId | ClientSessionId, ISessionClient>([
		[this.selfAttendee.sessionId, this.selfAttendee],
	]);

	public constructor(runtime: IEphemeralRuntime) {
		// If already connected, populate self and attendees.
		const originalClientId = runtime.clientId;
		if (originalClientId !== undefined) {
			this.selfAttendee.currentConnectionId = () => originalClientId;
			this.attendees.set(originalClientId, this.selfAttendee);
		}

		// Watch for connected event that will produce new (or first) clientId.
		// This event is added before instantiating the datastore manager so
		// that self can be given a proper clientId before datastore manager
		// might possibly try to use it. (Datastore manager is expected to
		// use connected clientId more directly and no order dependence should
		// be relied upon, but helps with debugging consistency.)
		runtime.on("connected", (clientId: ClientConnectionId) => {
			this.selfAttendee.currentConnectionId = () => clientId;
			this.attendees.set(clientId, this.selfAttendee);
		});

		this.datastoreManager = new PresenceDatastoreManagerImpl(
			this.selfAttendee.sessionId,
			runtime,
			this,
		);
	}

	public readonly events = createEmitter<PresenceEvents>();

	public getAttendees(): ReadonlySet<ISessionClient> {
		return new Set(this.attendees.values());
	}

	public getAttendee(clientId: ClientConnectionId | ClientSessionId): ISessionClient {
		const attendee = this.attendees.get(clientId);
		if (attendee) {
			return attendee;
		}
		// This is a major hack to enable basic operation.
		// Missing attendees should be rejected.
		const newAttendee = {
			sessionId: clientId as ClientSessionId,
			currentConnectionId: () => clientId,
		} satisfies ISessionClient;
		this.attendees.set(clientId, newAttendee);
		return newAttendee;
	}

	public getMyself(): ISessionClient {
		return this.selfAttendee;
	}

	public getStates<TSchema extends PresenceStatesSchema>(
		workspaceAddress: PresenceWorkspaceAddress,
		requestedContent: TSchema,
	): PresenceStates<TSchema> {
		return this.datastoreManager.getWorkspace(`s:${workspaceAddress}`, requestedContent);
	}

	public getNotifications<TSchema extends PresenceStatesSchema>(
		workspaceAddress: PresenceWorkspaceAddress,
		requestedContent: TSchema,
	): PresenceStates<TSchema> {
		return this.datastoreManager.getWorkspace(`n:${workspaceAddress}`, requestedContent);
	}

	/**
	 * Check for Presence message and process it.
	 *
	 * @param address - Address of the message
	 * @param message - Message to be processed
	 * @param local - Whether the message originated locally (`true`) or remotely (`false`)
	 */
	public processSignal(address: string, message: IExtensionMessage, local: boolean): void {
		this.datastoreManager.processSignal(message, local);
	}
}

/**
 * Instantiates Presence Manager
 *
 * @internal
 */
export function createPresenceManager(runtime: IEphemeralRuntime): IPresenceManager {
	return new PresenceManager(runtime);
}

// ============================================================================
// This demonstrates pattern where PresenceStates creation uses a ctor and allows
// instanceof verification for new requests.
//
// /**
//  * @internal
//  */
// export type PresenceStatesFactory<TSchema, T> = new (
// 	containerRuntime: IContainerRuntime & IRuntimeInternal,
// 	initialContent: TSchema,
// ) => PresenceStatesEntry<TSchema, T>;

// class PresenceStatesEntry<TSchema extends PresenceStatesSchema>
// 	implements InstanceType<PresenceStatesFactory<TSchema, PresenceStates<TSchema>>>
// {
// 	public readonly map: PresenceStates<TSchema>;
// 	public readonly processSignal: (signal: IInboundSignalMessage, local: boolean) => void;
// 	public readonly ensureContent: (content: TSchema) => void;

// 	public constructor(
// 		runtime: IEphemeralRuntime,
// 		initialContent: TSchema,
// 	) {
// 		const { public, internal } = createPresenceStates(
// 			this,
// 			runtime,
// 			initialContent,
// 		);
// 		this.map = public;
// 		this.processSignal = internal.processSignal.bind(internal);
// 		this.ensureContent = internal.ensureContent.bind(internal);
// 	}
// }

// export class PresenceManager implements IContainerExtension<never> {
// 	public readonly extension: IPresenceManager = this;
// 	public readonly interface = this;

// 	public constructor(private readonly runtime: IExtensionRuntime) {}

// 	public onNewContext(): void {
// 		// No-op
// 	}

// 	static readonly extensionId = "dis:bb89f4c0-80fd-4f0c-8469-4f2848ee7f4a";
// 	private readonly maps = new Map<string, PresenceStatesEntry<unknown, unknown>>();

// 	/**
// 	 * Acquires an Presence Workspace from store or adds new one.
// 	 *
// 	 * @param mapAddress - Address of the requested Presence Workspace
// 	 * @param factory - Factory to create the Presence Workspace if not found
// 	 * @returns The Presence Workspace
// 	 */
// 	public acquirePresenceStates<
// 		T extends PresenceStatesFacade<unknown>,
// 		TSchema = T extends PresenceStatesFacade<infer _TSchema> ? _TSchema : never,
// 	>(
// 		containerRuntime: IContainerRuntime & IRuntimeInternal,
// 		mapAddress: PresenceWorkspaceAddress,
// 		requestedContent: TSchema,
// 		factoryFacade: PresenceStatesFactoryFacade<T>,
// 	): T {
// 		const factory = factoryFacade as unknown as PresenceStatesFactory<TSchema, T>;
// 		let existing = this.maps.get(mapAddress);
// 		if (existing) {
// 			assert(existing instanceof factory, "Existing PresenceStates is not of the expected type");
// 			return existing.ensureContent(requestedContent);
// 		}
//		// TODO create the appropriate ephemeral runtime (map address must be in submitSignal, etc.)
// 		const entry = new factory(containerRuntime, requestedContent);
// 		this.maps.set(mapAddress, entry);
// 		return entry.public;
// 	}
// }
