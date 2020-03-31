/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDisposable } from "@microsoft/fluid-common-definitions";
import { IError } from "@microsoft/fluid-driver-definitions";
import {
    ConnectionMode,
    IClientDetails,
    IContentMessage,
    IDocumentMessage,
    IProcessMessageResult,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
export interface IConnectionDetails {
    clientId: string;
    claims: ITokenClaims;
    existing: boolean;
    mode: ConnectionMode;
    parentBranch: string | null;
    version: string;
    initialClients?: ISignalClient[];
    initialMessages?: ISequencedDocumentMessage[];
    initialContents?: IContentMessage[];
    initialSignals?: ISignalMessage[];
    maxMessageSize: number;
    serviceConfiguration: IServiceConfiguration;
}

/**
 * Interface used to define a strategy for handling incoming delta messages
 */
export interface IDeltaHandlerStrategy {
    /**
     * Processes the message.
     */
    process: (message: ISequencedDocumentMessage) => IProcessMessageResult;

    /**
     * Processes the signal.
     */
    processSignal: (message: ISignalMessage) => void;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IComponent extends Readonly<Partial<IProvideDeltaSender>>{ }
}

export const IDeltaSender: keyof IProvideDeltaSender = "IDeltaSender";

export interface IProvideDeltaSender {
    readonly IDeltaSender: IDeltaSender;
}

export interface IDeltaSender extends IProvideDeltaSender {
    /**
     * Submits the given delta returning the client sequence number for the message. Contents is the actual
     * contents of the message. appData is optional metadata that can be attached to the op by the app.
     *
     * If batch is set to true then the submit will be batched - and as a result guaranteed to be ordered sequentially
     * in the global sequencing space. The batch will be flushed either when flush is called or when a non-batched
     * op is submitted.
     */
    submit(type: MessageType, contents: any, batch: boolean, metadata: any): number;

    flush(): void;
}

export interface IDeltaManager<T, U> extends EventEmitter, IDeltaSender, IDisposable {
    // The queue of inbound delta messages
    inbound: IDeltaQueue<T>;

    // The queue of outbound delta messages
    outbound: IDeltaQueue<U[]>;

    // The queue of inbound delta signals
    inboundSignal: IDeltaQueue<ISignalMessage>;

    // The current minimum sequence number
    minimumSequenceNumber: number;

    // The last sequence number processed by the delta manager
    referenceSequenceNumber: number;

    // The initial sequence number set when attaching the op handler
    initialSequenceNumber: number;

    // Details of client
    clientDetails: IClientDetails;

    // Protocol version being used to communicate with the service
    version: string;

    // Max message size allowed to the delta manager
    maxMessageSize: number;

    // Service configuration provided by the service.
    serviceConfiguration: IServiceConfiguration;

    // Flag to indicate whether the client can write or not.
    active: boolean;

    // Tells if user has no permissions to change document
    readonly?: boolean;

    close(): void;

    connect(requestedMode?: ConnectionMode): Promise<IConnectionDetails>;

    attachOpHandler(
        minSequenceNumber: number,
        sequenceNumber: number,
        handler: IDeltaHandlerStrategy,
        resume: boolean);

    submitSignal(content: any): void;

    on(event: "error", listener: (error: IError) => void);
    on(event: "prepareSend", listener: (messageBuffer: any[]) => void);
    on(event: "submitOp", listener: (message: IDocumentMessage) => void);
    on(event: "beforeOpProcessing", listener: (message: ISequencedDocumentMessage) => void);
    on(event: "allSentOpsAckd" | "caughtUp", listener: () => void);
    on(event: "closed", listener: (error?: IError) => void);
    on(event: "pong" | "processTime", listener: (latency: number) => void);
    on(event: "connect", listener: (details: IConnectionDetails) => void);
    on(event: "disconnect", listener: (reason: string) => void);
    on(event: "readonly", listener: (readonly: boolean) => void);
}

export interface IDeltaQueue<T> extends EventEmitter, IDisposable {
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

    /**
     * System level pause
     * @returns A promise which resolves when processing has been paused.
     */
    systemPause(): Promise<void>;

    /**
     * System level resume
     */
    systemResume(): void;
}
