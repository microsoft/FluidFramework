/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEvent, IEventProvider, ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IFluidHandleContext,
    IFluidSerializer,
    IFluidRouter,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IDeltaManager,
    ContainerWarning,
    AttachState,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    IQuorumClients,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { IInboundSignalMessage, IProvideFluidDataStoreRegistry } from "@fluidframework/runtime-definitions";
import { IChannel } from ".";

export interface IFluidDataStoreRuntimeEvents extends IEvent {
    (
        // eslint-disable-next-line @typescript-eslint/unified-signatures
        event: "disconnected" | "dispose" | "attaching" | "attached",
        listener: () => void,
    );
    (event: "op", listener: (message: ISequencedDocumentMessage) => void);
    (event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
    (event: "connected", listener: (clientId: string) => void);
}

/**
 * Represents the runtime for the data store. Contains helper functions/state of the data store.
 */
export interface IFluidDataStoreRuntime extends
    IFluidRouter,
    IEventProvider<IFluidDataStoreRuntimeEvents>,
    IDisposable,
    Partial<IProvideFluidDataStoreRegistry> {

    readonly id: string;

    /**
     * @deprecated - FluidSerializer is not required as DDSs are the only ones that serialize data.
     */
    readonly IFluidSerializer: IFluidSerializer;

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
     * Errors raised by distributed data structures
     * @deprecated Warnings are being deprecated
     */
    raiseContainerWarning(warning: ContainerWarning): void;
}
