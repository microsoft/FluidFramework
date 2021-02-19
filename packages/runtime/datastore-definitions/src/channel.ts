/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IChannelSummarizeResult, IGarbageCollectionData } from "@fluidframework/runtime-definitions";
import { IChannelAttributes } from "./storage";
import { IFluidDataStoreRuntime } from "./dataStoreRuntime";

export interface IChannel extends IFluidLoadable {
    /**
     * A readonly identifier for the channel
     */
    readonly id: string;

    readonly owner?: string;

    readonly attributes: IChannelAttributes;

    /**
     * Generates summary of the channel.
     * @returns A tree representing the summary of the channel.
     */
    summarize(fullTree?: boolean, trackState?: boolean): IChannelSummarizeResult;

    /**
     * True if the data structure is attached to storage.
     */
    isAttached(): boolean;

    /**
     * Enables the channel to send and receive ops
     */
    connect(services: IChannelServices): void;

    /**
     * Returns the GC data for this channel. It contains a list of GC nodes that contains references to
     * other GC nodes.
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    getGCData(fullGC?: boolean): IGarbageCollectionData;
}

/**
 * Handler provided by shared data structure to process requests from the runtime.
 */
export interface IDeltaHandler {
    /**
     * Processes the op.
     * @param message - The message to process
     * @param local - Whether the message originated from the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    process: (message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) => void;

    /**
     * State change events to indicate changes to the delta connection
     * @param connected - true if connected, false otherwise
     */
    setConnectionState(connected: boolean): void;

    /**
     * Called when the runtime asks the client to resubmit an op. This may be because the Container reconnected and
     * this op was not acked.
     * The client can choose to resubmit the same message, submit different / multiple messages or not submit anything
     * at all.
     * @param message - The original message that was submitted.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    reSubmit(message: any, localOpMetadata: unknown): void;
}

/**
 * Interface to represent a connection to a delta notification stream.
 */
export interface IDeltaConnection {
    connected: boolean;

    /**
     * Send new messages to the server.
     * @param messageContent - The content of the message to be sent.
     * @param localOpMetadata - The local metadata associated with the message. This is kept locally by the runtime
     * and not sent to the server. It will be provided back when this message is acknowledged by the server. It will
     * also be provided back when asked to resubmit the message.
     */
    submit(messageContent: any, localOpMetadata: unknown): void;

    /**
     * Attaches a message handler to the delta connection
     */
    attach(handler: IDeltaHandler): void;

    /**
     * Indicates that the channel is dirty and needs to be part of the summary. It is called by a SharedSummaryBlock
     * that needs to be part of the summary but does not generate ops.
     */
    dirty(): void;
}

/**
 * Storage services to read the objects at a given path.
 */
export interface IChannelStorageService {
    /**
     * Reads the object contained at the given path. Returns a base64 string representation for the object.
     */
    read(path: string): Promise<string>;

    readBlob(path: string): Promise<ArrayBufferLike>;
    /**
     * Determines if there is an object contained at the given path.
     */
    contains(path: string): Promise<boolean>;

    /**
     * Lists the blobs that exist at a specific path.
     */
    list(path: string): Promise<string[]>;
}

/**
 * Storage services to read the objects at a given path using the given delta connection.
 */
export interface IChannelServices {
    deltaConnection: IDeltaConnection;

    objectStorage: IChannelStorageService;
}

/**
 * Definitions of a channel factory. Factories follow a common model but enable custom behavior.
 */
export interface IChannelFactory {
    /**
     * String representing the type of the factory.
     */
    readonly type: string;

    /**
     * Attributes of the channel.
     */
    readonly attributes: IChannelAttributes;

    /**
     * Loads the given channel. This call is only ever invoked internally as the only thing
     * that is ever directly loaded is the document itself. Load will then only be called on documents that
     * were created and added to a channel.
     * @param runtime - Data store runtime containing state/info/helper methods about the data store.
     * @param id - ID of the channel.
     * @param services - Services to read objects at a given path using the delta connection.
     * @param channelAttributes - The attributes for the the channel to be loaded.
     * @returns The loaded object
     *
     * @privateRemarks
     * Thought: should the storage object include the version information and limit access to just files
     * for the given object? The latter seems good in general. But both are probably good things. We then just
     * need a way to allow the document to provide later storage for the object.
     */
    load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        channelAttributes: Readonly<IChannelAttributes>,
    ): Promise<IChannel>;

    /**
     * Creates a local version of the channel.
     * Calling attach on the object later will insert it into the object stream.
     * @param runtime - The runtime the new object will be associated with
     * @param id - The unique ID of the new object
     * @returns The newly created object.
     *
     * @privateRemarks
     * NOTE here - When we attach we need to submit all the pending ops prior to actually doing the attach
     * for consistency.
     */
    create(runtime: IFluidDataStoreRuntime, id: string): IChannel;
}
