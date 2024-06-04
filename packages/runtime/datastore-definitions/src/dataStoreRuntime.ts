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
import type { IQuorumClients, ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { IInboundSignalMessage } from "@fluidframework/runtime-definitions/internal";

import type { IChannel } from "./channel.js";

/**
 * Events emitted by {@link IFluidDataStoreRuntime}.
 * @alpha
 */
export interface IFluidDataStoreRuntimeEvents extends IEvent {
	(event: "disconnected" | "dispose" | "attaching" | "attached", listener: () => void);
	(event: "op", listener: (message: ISequencedDocumentMessage) => void);
	(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
	(event: "connected", listener: (clientId: string) => void);
}

/**
 * Manages the transmission of ops between the runtime and storage.
 * @alpha
 */
export type IDeltaManagerErased =
	ErasedType<"@fluidframework/container-definitions.IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>">;

/**
 * Represents the runtime for the data store. Contains helper functions/state of the data store.
 * @sealed
 * @alpha
 */
export interface IFluidDataStoreRuntime
	extends IEventProvider<IFluidDataStoreRuntimeEvents>,
		IDisposable {
	readonly id: string;

	readonly IFluidHandleContext: IFluidHandleContext;

	readonly rootRoutingContext: IFluidHandleContext;
	readonly channelsRoutingContext: IFluidHandleContext;
	readonly objectsRoutingContext: IFluidHandleContext;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly options: Record<string | number, any>;

	readonly deltaManager: IDeltaManagerErased;

	readonly clientId: string | undefined;

	readonly connected: boolean;

	readonly logger: ITelemetryBaseLogger;

	/**
	 * Indicates the attachment state of the data store to a host service.
	 */
	readonly attachState: AttachState;

	readonly idCompressor?: IIdCompressor;

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
	 * This api allows adding channel to data store after it was created.
	 * This allows callers to cusmomize channel instance. For example, channel implementation
	 * could have various modes of operations. As long as such configuration is provided at creation
	 * and stored in summaries (such that all users of such channel instance behave the same), this
	 * could be useful technique to have customized solutions without introducing a number of data structures
	 * that all have same implementation.
	 * This is also useful for scenarios like SharedTree DDS, where schema is provided at creation and stored in a summary.
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
	uploadBlob(blob: ArrayBufferLike, signal?: AbortSignal): Promise<IFluidHandle<ArrayBufferLike>>;

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
}
