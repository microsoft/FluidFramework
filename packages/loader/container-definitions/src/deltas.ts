import { EventEmitter } from "events";
import { IContentMessage, ISequencedDocumentMessage, ISignalMessage, MessageType } from "./protocol";

export interface IConnectionDetails {
    clientId: string;
    existing: boolean;
    parentBranch: string | null;
    initialMessages?: ISequencedDocumentMessage[];
    initialContents?: IContentMessage[];
    initialSignals?: ISignalMessage[];
    maxMessageSize: number;
}

/**
 * Interface used to define a strategy for handling incoming delta messages
 */
export interface IDeltaHandlerStrategy {
    /**
     * Preparess data necessary to process the message. The return value of the method will be passed to the process
     * function.
     */
    prepare: (message: ISequencedDocumentMessage) => Promise<any>;

    /**
     * Processes the message. The return value from prepare is passed in the context parameter.
     */
    process: (message: ISequencedDocumentMessage, context: any) => void;

    /**
     * Called immediately after process.
     */
    postProcess: (message: ISequencedDocumentMessage, context: any) => Promise<void>;

    /**
     * Processes the signal.
     */
    processSignal: (message: ISignalMessage) => void;
}

export interface IDeltaManager<T, U> extends EventEmitter {
    // The queue of inbound delta messages
    inbound: IDeltaQueue<T | undefined>;

    // the queue of outbound delta messages
    outbound: IDeltaQueue<U | undefined>;

    // The queue of inbound delta signals
    inboundSignal: IDeltaQueue<ISignalMessage | undefined>;

    // The current minimum sequence number
    minimumSequenceNumber: number;

    // The last sequence number processed by the delta manager
    referenceSequenceNumber: number;

    // Type of client
    clientType: string;

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

    attachOpHandler(sequenceNumber: number | undefined | null, handler: IDeltaHandlerStrategy, resume: boolean);

    submit(type: MessageType, contents: string): number;

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
