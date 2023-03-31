/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDisposable,
	IEvent,
	IEventProvider,
	ITelemetryLogger,
} from "@fluidframework/common-definitions";
import {
	IFluidHandleContext,
	IFluidRouter,
	IFluidHandle,
	FluidObject,
} from "@fluidframework/core-interfaces";
import {
	IAudience,
	IDeltaManager,
	AttachState,
	ILoaderOptions,
} from "@fluidframework/container-definitions";
import {
	IDocumentMessage,
	IQuorumClients,
	ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import {
	IInboundSignalMessage,
	IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions";
import { IChannel } from ".";

export interface IFluidDataStoreRuntimeEvents extends IEvent {
	(event: "disconnected" | "dispose" | "attaching" | "attached", listener: () => void);
	(event: "op", listener: (message: ISequencedDocumentMessage) => void);
	(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
	(event: "connected", listener: (clientId: string) => void);
}

/**
 * Represents the runtime for the data store. Contains helper functions/state of the data store.
 */
export interface IFluidDataStoreRuntime
	extends IFluidRouter,
		IEventProvider<IFluidDataStoreRuntimeEvents>,
		IDisposable,
		Partial<IProvideFluidDataStoreRegistry> {
	readonly id: string;

	readonly IFluidHandleContext: IFluidHandleContext;

	readonly rootRoutingContext: IFluidHandleContext;
	readonly channelsRoutingContext: IFluidHandleContext;
	readonly objectsRoutingContext: IFluidHandleContext;

	readonly options: ILoaderOptions;

	readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

	readonly clientId: string | undefined;

	readonly connected: boolean;

	readonly logger: ITelemetryLogger;

	/**
	 * Indicates the attachment state of the data store to a host service.
	 */
	readonly attachState: AttachState;

	/**
	 * Returns the channel with the given id
	 */
	getChannel(id: string): Promise<IChannel>;

	/**
	 * Invokes the given callback and expects that no ops are submitted
	 * until execution finishes. If an op is submitted, an error will be raised.
	 *
	 * Can be disabled by feature gate `Fluid.ContainerRuntime.DisableOpReentryCheck`
	 *
	 * @param callback - the callback to be invoked
	 */
	ensureNoDataModelChanges<T>(callback: () => T): T;

	/**
	 * Creates a new channel of the given type.
	 * @param id - ID of the channel to be created.  A unique ID will be generated if left undefined.
	 * @param type - Type of the channel.
	 */
	createChannel(id: string | undefined, type: string): IChannel;

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
	uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>>;

	/**
	 * Submits the signal to be sent to other clients.
	 * @param type - Type of the signal.
	 * @param content - Content of the signal.
	 */
	submitSignal(type: string, content: any): void;

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
	 * with it. If this property is undefined (meaning that exposing the entryPoint hasn't been implemented in a
	 * particular scenario) fall back to the current approach of requesting the root object through the request pattern.
	 *
	 * @remarks The plan is that eventually the data store will stop providing IFluidRouter functionality, this property
	 * will become non-optional and return an IFluidHandle (no undefined) and will become the only way to access
	 * the data store's entryPoint.
	 */
	readonly entryPoint?: IFluidHandle<FluidObject>;
}
