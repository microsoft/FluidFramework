/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEventProvider, IEvent, IErrorEvent } from "@fluidframework/common-definitions";
import {
    IClientConfiguration,
    IClientDetails,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@fluidframework/protocol-definitions";

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
    interface IFluidObject  {
        /** @deprecated - use `FluidObject<IDeltaSender>` instead */
        readonly IDeltaSender?: IDeltaSender
     }
}

/**
 * @deprecated - This will be removed in a later release.
 */
export const IDeltaSender: keyof IProvideDeltaSender = "IDeltaSender";

/**
 * @deprecated - This will be removed in a later release.
 */
export interface IProvideDeltaSender {
    /**
     * @deprecated - This will be removed in a later release.
     */
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
    /**
     * The connect event fires once we've received the connect_document_success message from the
     * server.  This happens prior to the client's join message (if there is a join message).
     */
    (event: "connect", listener: (details: { clientId: string }, opsBehind?: number) => void);
    (event: "disconnect", listener: (reason: string) => void);
    (event: "readonly", listener: (readonly: boolean) => void);
}

/**
 * Manages the transmission of ops between the runtime and storage.
 */
export interface IDeltaManager<T, U> extends IEventProvider<IDeltaManagerEvents>, IDeltaSender, IDisposable {
    /** The queue of inbound delta messages */
    readonly inbound: IDeltaQueue<T>;

    /** @deprecated in 0.54 - should not be exposed */
    readonly outbound: IDeltaQueue<U[]>;

    /** @deprecated in 0.54 - should not be exposed */
    readonly inboundSignal: IDeltaQueue<ISignalMessage>;

    /** The current minimum sequence number */
    readonly minimumSequenceNumber: number;

    /** The last sequence number processed by the delta manager */
    readonly lastSequenceNumber: number;

    /** The last message processed by the delta manager */
    readonly lastMessage: ISequencedDocumentMessage | undefined;

    /** The latest sequence number the delta manager is aware of */
    readonly lastKnownSeqNumber: number;

    /** The initial sequence number set when attaching the op handler */
    readonly initialSequenceNumber: number;

    /** @deprecated in 0.54 - should not be exposed */
    readonly hasCheckpointSequenceNumber: boolean;

    /** Details of client */
    readonly clientDetails: IClientDetails;

    /** @deprecated in 0.54 - low level protocol should not be exposed to runtime */
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
     * @deprecated - use readOnlyInfo
     */
    readonly readonly?: boolean;

    readonly readOnlyInfo: ReadOnlyInfo;

    /** @deprecated in 0.54 - please use IContainerContext.closeFn */
    close(): void;

    /** @deprecated in 0.54 - please use IContainerContext.submitSignalFn */
    submitSignal(content: any): void;
}

/** Events emitted by a Delta Queue */
export interface IDeltaQueueEvents<T> extends IErrorEvent {
    (event: "push" | "op", listener: (task: T) => void);
    /**
     * @param count - number of events (T) processed before becoming idle
     * @param duration - amount of time it took to process elements (milliseconds).
     */
    (event: "idle", listener: (count: number, duration: number) => void);
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

    waitTillProcessingDone(): Promise<void>;
}

export type ReadOnlyInfo = {
    readonly readonly: false | undefined;
} | {
    readonly readonly: true;
    /** read-only because forceReadOnly() was called */
    readonly forced: boolean;
    /** read-only because client does not have write permissions for document */
    readonly permissions: boolean | undefined;
    /** read-only with no delta stream connection */
    readonly storageOnly: boolean;
};
