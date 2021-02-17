/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEventProvider, IEvent, IErrorEvent } from "@fluidframework/common-definitions";
import {
    ConnectionMode,
    IClientConfiguration,
    IClientDetails,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
} from "@fluidframework/protocol-definitions";

/**
 * Contract representing the result of a newly established connection to the server for syncing deltas
 */
export interface IConnectionDetails {
    clientId: string;
    claims: ITokenClaims;
    existing: boolean;
    mode: ConnectionMode;
    version: string;
    initialClients: ISignalClient[];
    maxMessageSize: number;
    serviceConfiguration: IClientConfiguration;
    /**
     * Last known sequence number to ordering service at the time of connection
     * It may lap actual last sequence number (quite a bit, if container  is very active).
     * But it's best information for client to figure out how far it is behind, at least
     * for "read" connections. "write" connections may use own "join" op to similar information,
     * that is likely to be more up-to-date.
     */
    checkpointSequenceNumber: number | undefined;
}

/**
 * Interface used to define a strategy for handling incoming delta messages
 */
export interface IDeltaHandlerStrategy {
    /**
     * Processes the message.
     */
    process: (message: ISequencedDocumentMessage) => void;

    /**
     * Processes the signal.
     */
    processSignal: (message: ISignalMessage) => void;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IFluidObject extends Readonly<Partial<IProvideDeltaSender>> { }
}

export const IDeltaSender: keyof IProvideDeltaSender = "IDeltaSender";

export interface IProvideDeltaSender {
    readonly IDeltaSender: IDeltaSender;
}

/**
 * Contract supporting delivery of outbound messages to the server
 */
export interface IDeltaSender extends IProvideDeltaSender {
    /**
     * Flush all pending messages through the outbound queue
     */
    flush(): void;
}

/** Events emitted by the Delta Manager */
export interface IDeltaManagerEvents extends IEvent {
    (event: "prepareSend", listener: (messageBuffer: any[]) => void);
    (event: "submitOp", listener: (message: IDocumentMessage) => void);
    (event: "op", listener: (message: ISequencedDocumentMessage, processingTime: number) => void);
    (event: "allSentOpsAckd", listener: () => void);
    (event: "pong" | "processTime", listener: (latency: number) => void);
    (event: "connect", listener: (details: IConnectionDetails, opsBehind?: number) => void);
    (event: "disconnect", listener: (reason: string) => void);
    (event: "readonly", listener: (readonly: boolean) => void);
}

/**
 * Manages the transmission of ops between the runtime and storage.
 */
export interface IDeltaManager<T, U> extends IEventProvider<IDeltaManagerEvents>, IDeltaSender, IDisposable {
    /** The queue of inbound delta messages */
    readonly inbound: IDeltaQueue<T>;

    /** The queue of outbound delta messages */
    readonly outbound: IDeltaQueue<U[]>;

    /** The queue of inbound delta signals */
    readonly inboundSignal: IDeltaQueue<ISignalMessage>;

    /** The current minimum sequence number */
    readonly minimumSequenceNumber: number;

    /** The last sequence number processed by the delta manager */
    readonly lastSequenceNumber: number;

    /** The latest sequence number the delta manager is aware of */
    readonly lastKnownSeqNumber: number;

    /** The initial sequence number set when attaching the op handler */
    readonly initialSequenceNumber: number;

    /**
     * Tells if  current connection has checkpoint information.
     * I.e. we know how far behind the client was at the time of establishing connection
     */
    readonly hasCheckpointSequenceNumber: boolean;

    /** Details of client */
    readonly clientDetails: IClientDetails;

    /** Protocol version being used to communicate with the service */
    readonly version: string;

    /** Max message size allowed to the delta manager */
    readonly maxMessageSize: number;

    /** Service configuration provided by the service. */
    readonly serviceConfiguration: IClientConfiguration | undefined;

    /** Flag to indicate whether the client can write or not. */
    readonly active: boolean;

    /**
     * Tells if container is in read-only mode.
     * Data stores should listen for "readonly" notifications and disallow user making changes to data stores.
     * Readonly state can be because of no storage write permission,
     * or due to host forcing readonly mode for container.
     *
     * We do not differentiate here between no write access to storage vs. host disallowing changes to container -
     * in all cases container runtime and data stores should respect readonly state and not allow local changes.
     *
     * It is undefined if we have not yet established websocket connection
     * and do not know if user has write access to a file.
     */
    readonly readonly?: boolean;

    /** Terminate the connection to storage */
    close(): void;

    /** Submit a signal to the service to be broadcast to other connected clients, but not persisted */
    submitSignal(content: any): void;
}

/** Events emitted by a Delta Queue */
export interface IDeltaQueueEvents<T> extends IErrorEvent {
    (event: "push" | "op", listener: (task: T) => void);
    (event: "idle", listener: () => void);
}

/**
 * Queue of ops to be sent to or processed from storage
 */
export interface IDeltaQueue<T> extends IEventProvider<IDeltaQueueEvents<T>>, IDisposable {
    /**
     * Flag indicating whether or not the queue was paused
     */
    paused: boolean;

    /**
     * The number of messages remaining in the queue
     */
    length: number;

    /**
     * Flag indicating whether or not the queue is idle
     */
    idle: boolean;

    /**
     * Pauses processing on the queue
     * @returns A promise which resolves when processing has been paused.
     */
    pause(): Promise<void>;

    /**
     * Resumes processing on the queue
     */
    resume(): void;

    /**
     * Peeks at the next message in the queue
     */
    peek(): T | undefined;

    /**
     * Returns all the items in the queue as an array. Does not remove them from the queue.
     */
    toArray(): T[];
}
