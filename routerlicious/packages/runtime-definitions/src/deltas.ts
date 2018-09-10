import { EventEmitter } from "events";

export interface IDeltaManager {
    // The queue of inbound delta messages
    inbound: IDeltaQueue;

    // the queue of outbound delta messages
    outbound: IDeltaQueue;

    /**
     * Puts the delta manager in read only mode
     */
    enableReadonlyMode(): void;
}

export interface IDeltaQueue extends EventEmitter {
    /**
     * Flag indicating whether or not the queue was paused
     */
    paused: boolean;

    /**
     * The number of messages remaining in the queue
     */
    length: number;

    /**
     * Flag indicating whether or not the queue is empty
     */
    empty: boolean;

    /**
     * Pauses processing on the queue
     */
    pause();

    /**
     * Resumes processing on the queue
     */
    resume();
}
