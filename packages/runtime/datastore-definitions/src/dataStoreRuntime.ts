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
}

/**
 * Manages the transmission of ops between the runtime and storage.
 * @legacy @beta
 */
export type IDeltaManagerErased =
	ErasedType<"@fluidframework/container-definitions.IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>">;

/**
 * Final, sequenced outcome of a claim attempt.
 *
 * - `"Success"` - this client owns the claim for the given key.
 * - `"AlreadyClaimed"` - another client has already claimed the key; the
 * existing value is unchanged. Claims are first-writer-wins and are
 * immutable for the lifetime of the document.
 * @legacy @beta
 */
export type ClaimResult = "Success" | "AlreadyClaimed";

/**
 * The synchronous handle returned by
 * {@link IFluidDataStoreRuntime.trySetClaim}.
 *
 * The shape is a discriminated union on {@link IClaimAttempt.status}:
 *
 * - When `status` is `"Success"` or `"AlreadyClaimed"`, the outcome is
 * already known locally (detached, or the key was previously
 * sequenced); no further work is required.
 * - When `status` is `"Pending"`, the outcome cannot be determined
 * locally yet — for example, the client is attached but disconnected,
 * the op has been submitted but not yet sequenced, or claim state is
 * still being hydrated from the base snapshot. In that case,
 * {@link IClaimAttempt.result} resolves to the eventual sequenced
 * {@link ClaimResult}, or rejects if the runtime is disposed before the
 * attempt is sequenced.
 *
 * Callers can branch on `status` synchronously for race / fallback
 * logic without ever creating a promise on the terminal paths.
 * @legacy @beta
 */
export type IClaimAttempt =
	| {
			readonly status: "Success" | "AlreadyClaimed";
	  }
	| {
			readonly status: "Pending";
			/**
			 * Resolves to the final sequenced {@link ClaimResult} once the
			 * op (this client's or another's) is sequenced. Rejects if the
			 * runtime is disposed before the attempt is sequenced.
			 */
			readonly result: Promise<ClaimResult>;
	  };

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

	/**
	 * Attempt to set a first-writer-wins "claim" for the given key on this data
	 * store. Once a claim has been sequenced for a key, no other client can
	 * overwrite it for the lifetime of the document.
	 *
	 * @remarks
	 * Claims are intended for partner scenarios that need to wire up singleton
	 * components (typically a handle to a child DDS) with first-writer-wins
	 * semantics, instead of the last-writer-wins semantics provided by writing
	 * to a DDS such as `SharedDirectory`.
	 *
	 * The value is JSON-serializable. {@link @fluidframework/core-interfaces#IFluidHandle}
	 * instances embedded in the value are encoded the same way as handles in
	 * summary blobs and contribute to garbage-collection routes from this data
	 * store.
	 *
	 * Returns synchronously with an {@link IClaimAttempt} describing the
	 * outcome. When the outcome is known locally — the key was already
	 * sequenced, or the data store is detached — `status` is `"Success"`
	 * or `"AlreadyClaimed"` and there is nothing to await. Otherwise
	 * `status` is `"Pending"` and {@link IClaimAttempt.result} resolves
	 * to the eventual sequenced {@link ClaimResult} (`"Success"` for the
	 * client whose op is sequenced first for the key, and
	 * `"AlreadyClaimed"` for every other client).
	 *
	 * Local ops are automatically resubmitted by the runtime across
	 * reconnects, so the result promise will eventually resolve once the
	 * client reconnects — unless the runtime is disposed first, in which
	 * case the result promise rejects.
	 *
	 * Optional. Implementations that do not support claims will not provide
	 * this method.
	 *
	 * @param key - The claim key.
	 * @param value - The claim value (JSON-serializable; may include handles).
	 * @returns An {@link IClaimAttempt} discriminated on `status`.
	 */
	trySetClaim?(key: string, value: unknown): IClaimAttempt;

	/**
	 * Returns the value of a previously-claimed key, with embedded handles
	 * decoded. Returns `undefined` if the key has not (yet) been claimed.
	 *
	 * Optional. Implementations that do not support claims will not provide
	 * this method.
	 */
	getClaim?(key: string): unknown;

	/**
	 * Returns `true` if the given key has been sequenced as a claim on this
	 * data store.
	 *
	 * Optional. Implementations that do not support claims will not provide
	 * this method.
	 */
	hasClaim?(key: string): boolean;

	/**
	 * Read-only view of all sequenced claims on this data store, with embedded
	 * handles decoded.
	 *
	 * Optional. Implementations that do not support claims will not provide
	 * this property.
	 */
	readonly claims?: ReadonlyMap<string, unknown>;
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
