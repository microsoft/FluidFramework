/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AttachState, IAudience } from "@fluidframework/container-definitions";
import type {
	IFluidHandle,
	FluidObject,
	IDisposable,
	IEvent,
	IEventProvider,
	ITelemetryBaseLogger,
	ErasedType,
} from "@fluidframework/core-interfaces";
import type { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import type { IQuorumClients } from "@fluidframework/driver-definitions";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type {
	IInboundSignalMessage,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";

import type { IChannel } from "./channel.js";

/**
 * Callback invoked on the losing client after a channel-creation "race"
 * resolves. The runtime schedules this asynchronously after the current op
 * processing step; it does not block op processing.
 *
 * @param loser - The local channel that lost the race. This channel's context
 * has been removed from the runtime; the consumer should stop using it after
 * this callback returns. The callback should read any state from `loser` and
 * apply it to the winner via `runtime.getChannel(winnerChannelId)`.
 * @param winnerChannelId - The id of the winning channel. Use
 * `IFluidDataStoreRuntime.getChannel` to obtain a handle to it.
 *
 * @alpha
 */
export type OnRaceLost = (loser: IChannel, winnerChannelId: string) => void;

/**
 * Events emitted by {@link IFluidDataStoreRuntime}.
 * @legacy @beta
 */
export interface IFluidDataStoreRuntimeEvents extends IEvent {
	(event: "disconnected", listener: () => void);
	(event: "dispose", listener: () => void);
	(event: "attaching", listener: () => void);
	(event: "attached", listener: () => void);
	(event: "op", listener: (message: ISequencedDocumentMessage) => void);
	(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
	(event: "connected", listener: (clientId: string) => void);
	/*
	 * The readonly event is fired when the readonly state of the datastore runtime changes.
	 * The isReadOnly param will express the new readonly state.
	 */
	(event: "readonly", listener: (isReadOnly: boolean) => void);

	/**
	 * Fired after a "race" between concurrent channel creations resolves
	 * deterministically across all clients. See `createChannel`'s race overload.
	 *
	 * @alpha
	 */
	(
		event: "raceResolved",
		listener: (info: {
			raceId: string;
			winnerChannelId: string;
			loserChannelIds: readonly string[];
		}) => void,
	);
}

/**
 * Manages the transmission of ops between the runtime and storage.
 * @legacy @beta
 */
export type IDeltaManagerErased =
	ErasedType<"@fluidframework/container-definitions.IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>">;

/**
 * Represents the runtime for the data store. Contains helper functions/state of the data store.
 * @sealed
 * @legacy @beta
 */
export interface IFluidDataStoreRuntime
	extends IEventProvider<IFluidDataStoreRuntimeEvents>,
		IDisposable {
	readonly id: string;

	readonly IFluidHandleContext: IFluidHandleContext;

	readonly rootRoutingContext: IFluidHandleContext;
	readonly channelsRoutingContext: IFluidHandleContext;
	readonly objectsRoutingContext: IFluidHandleContext;

	// TODO: Use something other than `any` (breaking change)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly options: Record<string | number, any>;

	readonly deltaManager: IDeltaManagerErased;

	readonly clientId: string | undefined;

	readonly connected: boolean;

	/**
	 * Get the current readonly state.
	 * @returns true if read-only, otherwise false
	 */
	readonly isReadOnly: () => boolean;

	readonly logger: ITelemetryBaseLogger;

	/**
	 * Indicates the attachment state of the data store to a host service.
	 */
	readonly attachState: AttachState;

	/**
	 * An optional ID compressor.
	 * @remarks
	 * When provided, can be used to compress and decompress IDs stored in this datastore.
	 * Some SharedObjects, like SharedTree, require this.
	 */
	readonly idCompressor: IIdCompressor | undefined;

	/**
	 * Returns the channel with the given id
	 */
	getChannel(id: string): Promise<IChannel>;

	/**
	 * Creates a new channel of the given type.
	 * @param id - ID of the channel to be created.  A unique ID will be generated if left undefined.
	 * @param type - Type of the channel.
	 */
	createChannel(id: string | undefined, type: string): IChannel;

	/**
	 * Creates a new channel that participates in a first-attach-wins "race"
	 * with concurrent creations on other clients.
	 *
	 * @remarks
	 * All clients calling this overload with the same `raceId` converge on a
	 * single attached channel: the first attach op sequenced for a given
	 * `raceId` wins, and every other client's locally-created channel becomes
	 * a "loser" whose subsequent ops are dropped deterministically by every
	 * client. The losing client may register an `onLost` callback to merge
	 * its local state into the winner.
	 *
	 * Each racing client receives its own locally-unique channel id; only the
	 * `raceId` is shared across clients. Use `IChannel.id` on the returned
	 * channel for local routing.
	 *
	 * Throws a `UsageError` if:
	 * - The document schema has not enabled the race-id channel-create feature.
	 * - The data store is detached or in staging mode.
	 * - This client has already created a racing channel with the same `raceId`.
	 *
	 * `onLost` is invoked asynchronously (after the current op processing
	 * step) on the losing client; it does not block op processing. If `onLost`
	 * is not provided and this client loses, the loser context is silently
	 * removed and a telemetry event is fired.
	 *
	 * @param raceId - Identifier shared across racing clients.
	 * @param type - Type of the channel.
	 * @param raceOptions - Race semantics opt-in. Presence of this argument
	 * marks the call as a race participant.
	 *
	 * @alpha
	 */
	createChannel(
		raceId: string,
		type: string,
		raceOptions: { onLost?: OnRaceLost },
	): IChannel;

	/**
	 * Adds an existing channel to the data store.
	 *
	 * @remarks
	 * This allows callers to customize channel instance.
	 *
	 * For example, a channel implementation could have various modes of operations.
	 * As long as such configuration is provided at creation
	 * and stored in summaries (such that all users of such channel instance behave the same), this
	 * could be useful technique to have customized solutions without introducing a number of data structures
	 * that all have same implementation.
	 *
	 * This is also useful for scenarios like SharedTree DDS, where schema is provided at creation and stored in a summary.
	 *
	 * The channel type should be present in the registry, otherwise the runtime would reject
	 * the channel. The runtime used to create the channel object should be same to which
	 * it is added.
	 * @param channel - channel which needs to be added to the runtime.
	 */
	addChannel(channel: IChannel): void;

	/**
	 * Bind the channel with the data store runtime. If the runtime
	 * is attached then we attach the channel to make it live.
	 */
	bindChannel(channel: IChannel): void;

	// Blob related calls
	/**
	 * Api to upload a blob of data.
	 * @param blob - blob to be uploaded.
	 */
	uploadBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandle<ArrayBufferLike>>;

	/**
	 * Submits the signal to be sent to other clients.
	 * @param type - Type of the signal.
	 * @param content - Content of the signal. Should be a JSON serializable object or primitive.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	submitSignal: (type: string, content: unknown, targetClientId?: string) => void;

	/**
	 * Returns the current quorum.
	 */
	getQuorum(): IQuorumClients;

	/**
	 * Returns the current audience.
	 */
	getAudience(): IAudience;

	/**
	 * Resolves when a local data store is attached.
	 */
	waitAttached(): Promise<void>;

	/**
	 * Exposes a handle to the root object / entryPoint of the data store. Use this as the primary way of interacting
	 * with it.
	 */
	readonly entryPoint: IFluidHandle<FluidObject>;

	/**
	 * Indicates the current local operation activity being performed by the data store runtime.
	 *
	 * @remarks
	 * This property allows consumers to know when the runtime itself is actively making changes to data store DDSes.
	 * When this property is not `undefined`, consumers should expect to see state modifications initiated by the runtime
	 * rather than by the consumer directly:
	 * - `"applyStashed"` - The runtime is applying previously stashed operations during reconnection or container load.
	 * Stashed operations are local changes that were submitted but not yet acknowledged when a container was closed,
	 * and are being reapplied to restore the expected local state.
	 * - `"rollback"` - The runtime is rolling back (reverting) local operations that the user has chosen not to submit.
	 * This occurs when operations are being discarded, such as when exiting staging mode without committing changes.
	 * - `undefined` - No local operation activity is currently in progress.
	 */
	readonly activeLocalOperationActivity?: "applyStashed" | "rollback" | undefined;

	/**
	 * Indicates whether the container is currently in staging mode.
	 *
	 * @remarks
	 * See {@link @fluidframework/runtime-definitions#IContainerRuntimeBase.enterStagingMode} for known limitations.
	 */
	readonly inStagingMode: boolean;

	/**
	 * Indicates whether the data store has uncommitted local changes.
	 */
	readonly isDirty: boolean;
}

/**
 * @legacy @alpha
 * @sealed
 */
export interface IFluidDataStoreRuntimeAlpha extends IFluidDataStoreRuntime {}

/**
 * Internal configs possibly implemented by IFuidDataStoreRuntimes, for use only within the runtime layer.
 * For example, temporary layer compatibility details
 *
 * @internal
 */
export interface IFluidDataStoreRuntimeInternalConfig {
	readonly submitMessagesWithoutEncodingHandles?: boolean;

	/**
	 * Minimum version of the Fluid Framework runtime that is required to collaborate on new documents.
	 * @remarks
	 * DDSes may read this value to determine which feature flags should be enabled.Expand commentComment on line R313Resolved
	 * This property is consumed by `SharedObjectFactory` (which are implementations of
	 * {@link @fluidframework/datastore-definitions#IChannelFactory}).
	 * See {@link @fluidframework/container-runtime#LoadContainerRuntimeParams.minVersionForCollab} for more details.
	 */
	readonly minVersionForCollab?: MinimumVersionForCollab;
}
