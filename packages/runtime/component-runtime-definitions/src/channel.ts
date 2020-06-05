/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentLoadable } from "@fluidframework/component-core-interfaces";
import { ISequencedDocumentMessage, ITree } from "@fluidframework/protocol-definitions";
import { IChannelAttributes } from "./storage";

declare module "@fluidframework/container-definitions" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IComponent extends Readonly<Partial<IProvideChannel>> { }
}

export const IChannel: keyof IProvideChannel = "IChannel";

export interface IProvideChannel {
    readonly IChannel: IChannel;
}

export interface IChannel extends IProvideChannel, IComponentLoadable {
    /**
     * A readonly identifier for the shared object
     */
    readonly id: string;

    readonly owner?: string;

    readonly attributes: IChannelAttributes;

    /**
     * Generates snapshot of the shared object.
     */
    snapshot(): ITree;

    /**
     * True if the data structure is local.
     * It is local if either it is not attached or container is not attached to storage.
     * It will be lost on browser tab closure if not attached.
     */
    isLocal(): boolean;

    /**
     * True if the channel has been registered.
     */
    isRegistered(): boolean;

    /**
     * Enables the channel to send and receive ops
     */
    connect(services: ISharedObjectServices): void;

    // Tells the shared object to start collaboration.
    startCollaboration(): void;
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
     * @returns A clientSequenceNumber that uniquely identifies this message for this client.
     */
    submit(messageContent: any, localOpMetadata: unknown): number;

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
export interface IObjectStorageService {
    /**
     * Reads the object contained at the given path. Returns a base64 string representation for the object.
     */
    read(path: string): Promise<string>;

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
export interface ISharedObjectServices {
    deltaConnection: IDeltaConnection;

    objectStorage: IObjectStorageService;
}
