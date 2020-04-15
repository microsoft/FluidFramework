/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { ConnectionState, ISequencedDocumentMessage, ITree } from "@microsoft/fluid-protocol-definitions";
import { IChannelAttributes } from "./storage";

declare module "@microsoft/fluid-container-definitions" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IComponent extends Readonly<Partial<IProvideChannel>> { }
}

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
     * True if the data structure is local i.e. one that is not attached, and thus known only to this client.
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
}

/**
 * Message send by client attaching local data structure.
 * Contains snapshot of data structure which is the current state of this data structure.
 */
export interface IAttachMessage {
    // The identifier for the object
    id: string;

    // The type of object
    type: string;

    // Initial snapshot of the document (contains ownership)
    snapshot: ITree;
}

/**
 * Handler provided by shared data structure to process incoming ops.
 */
export interface IDeltaHandler {
    /**
     * Processes the op.
     */
    process: (message: ISequencedDocumentMessage, local: boolean) => void;

    /**
     * State change events to indicate changes to the delta connection
     */
    setConnectionState(state: ConnectionState): void;
}

/**
 * Interface to represent a connection to a delta notification stream.
 */
export interface IDeltaConnection {
    state: ConnectionState;

    /**
     * Send new messages to the server. Returns the client ID for the message. Must be in a connected state
     * to submit a message.
     */
    submit(messageContent: any): number;

    /**
     * Attaches a message handler to the delta connection
     */
    attach(handler: IDeltaHandler): void;

    /**
     * Indicates that the channel is dirty and needs to be part of the summary. It is called by a summarizable
     * object that needs to be part of the summary but does not generate ops.
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
}

/**
 * Storage services to read the objects at a given path using the given delta connection.
 */
export interface ISharedObjectServices {
    deltaConnection: IDeltaConnection;

    objectStorage: IObjectStorageService;
}
