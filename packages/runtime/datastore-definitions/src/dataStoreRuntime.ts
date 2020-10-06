/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDisposable, ITelemetryLogger } from "@fluidframework/common-definitions";
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
    ILoader,
    AttachState,
} from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { IInboundSignalMessage, IProvideFluidDataStoreRegistry } from "@fluidframework/runtime-definitions";
import { IChannel } from ".";

/**
 * Represents the runtime for the data store. Contains helper functions/state of the data store.
 */
export interface IFluidDataStoreRuntime extends
    IFluidRouter,
    EventEmitter,
    IDisposable,
    Partial<IProvideFluidDataStoreRegistry> {

    readonly id: string;

    readonly IFluidSerializer: IFluidSerializer;

    readonly IFluidHandleContext: IFluidHandleContext;

    readonly options: any;

    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

    readonly clientId: string | undefined;

    readonly documentId: string;

    readonly existing: boolean;

    readonly parentBranch: string | null;

    readonly connected: boolean;

    readonly loader: ILoader;

    readonly logger: ITelemetryLogger;

    /**
     * Indicates the attachment state of the data store to a host service.
     */
    readonly attachState: AttachState;

    on(
        event: "disconnected" | "dispose" | "leader" | "notleader" | "attaching" | "attached",
        listener: () => void,
    ): this;
    on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    on(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void): this;
    on(event: "connected", listener: (clientId: string) => void): this;

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

    /**
     * Api for generating the snapshot of the data store.
     * @param message - Message for the snapshot.
     */
    snapshot(message: string): Promise<void>;

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
    getQuorum(): IQuorum;

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
     */
    raiseContainerWarning(warning: ContainerWarning): void;
}
