/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IComponent } from "./components";
import { IContentMessage, ISequencedDocumentMessage, ISignalMessage, MessageType } from "./protocol";

// Summary algorithm configuration
// A summary will occur either if
// * idleTime(ms) have passed without activity with pending ops to summarize
// * maxTime(ms) have passed without activity with pending ops to summarize
// * maxOps are waiting to summarize
export interface ISummaryConfiguration {
    idleTime: number;

    maxTime: number;

    maxOps: number;
}

/**
 * key value store of service configuration properties provided as part of connection
 */
export interface IServiceConfiguration {
    [key: string]: any;

    // Max message size the server will accept before requiring chunking
    maxMessageSize: number;

    // Server defined ideal block size for storing snapshots
    blockSize: number;

    summary: ISummaryConfiguration;
}

export interface IConnectionDetails {
    clientId: string;
    existing: boolean;
    parentBranch: string | null;
    version: string;
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
     * Processes the message. The return value from prepare is passed in the context parameter.
     * @param context - Deprecated: will be removed in a future release
     */
    process: (message: ISequencedDocumentMessage, callback: (err?: any) => void) => void;

    /**
     * Processes the signal.
     */
    processSignal: (message: ISignalMessage) => void;
}

export interface IDeltaSender extends IComponent {
    /**
     * Submits the given delta returning the client sequence number for the message. Contents is the actual
     * contents of the message. appData is optional metadata that can be attached to the op by the app.
     *
     * If batch is set to true then the submit will be batched - and as a result guaranteed to be ordered sequentially
     * in the global sequencing space. The batch will be flushed either when flush is called or when a non-batched
     * op is submitted.
     */
    submit(type: MessageType, contents: any, batch: boolean, appData: any): number;

    flush(): void;
}

export interface IDeltaManager<T, U> extends EventEmitter, IDeltaSender {
    // The queue of inbound delta messages
    inbound: IDeltaQueue<T>;

    // the queue of outbound delta messages
    outbound: IDeltaQueue<U[]>;

    // The queue of inbound delta signals
    inboundSignal: IDeltaQueue<ISignalMessage>;

    // The current minimum sequence number
    minimumSequenceNumber: number;

    // The last sequence number processed by the delta manager
    referenceSequenceNumber: number;

    // Type of client
    clientType: string;

    // Protocol version being used to communicate with the service
    version: string;

    // Max message size allowed to the delta manager
    maxMessageSize: number;

    /**
     * Puts the delta manager in read only mode
     */
    enableReadonlyMode(): void;

    disableReadonlyMode(): void;

    close(): void;

    connect(reason: string): Promise<IConnectionDetails>;

    getDeltas(reason: string, from: number, to?: number): Promise<ISequencedDocumentMessage[]>;

    attachOpHandler(
        minSequenceNumber: number,
        sequenceNumber: number,
        handler: IDeltaHandlerStrategy,
        resume: boolean);

    submitSignal(content: any): void;
}

export interface IDeltaQueue<T> extends EventEmitter {
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
     */
    pause(): Promise<void>;

    /**
     * Resumes processing on the queue
     */
    resume(): Promise<void>;

    /**
     * Peeks at the next message in the queue
     */
    peek(): T | undefined;

    /**
     * System level pause
     */
    systemPause(): Promise<void>;

    /**
     * System level resume
     */
    systemResume(): Promise<void>;
}
