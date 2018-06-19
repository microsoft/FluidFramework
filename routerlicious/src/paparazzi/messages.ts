// tslint:disable:ban-types
/**
 * Interface to implement the task/agent receiver.
 */
export interface IMessageReceiver {

    /**
     * Preps the underlying message queue.
     */
    initialize(): Promise<void>;

    /**
     * Notifies on error.
     */
    on(event: string, listener: Function): this;

    /**
     * Notifies on error.
     */
    close(): Promise<void>;
}

/**
 * Message received by the receiver.
 */
export interface IMessage {

    type: string;

    content: any;
}
