// tslint:disable:ban-types
import { utils } from "@prague/client-api";

export interface IMessage {
    topic: string;
    value: string;
    offset: number;
    partition: number;
    highWaterOffset: number;
    key: string;
}

export interface IPartition {
    topic: string;
    partition: number;
    offset: number;
}

export interface IConsumer {
    groupId: string;

    topic: string;

    /**
     * Commits consumer offset.
     */
    commitOffset(data: any[]): Promise<void>;

    /**
     * Event Handler.
     */
    on(event: "data", listener: (message: IMessage) => void): this;
    on(event: "rebalancing" | "rebalanced", listener: (partitions: IPartition[]) => void): this;
    on(event: string, listener: Function): this;

    /**
     * Closes the consumer.
     */
    close(): Promise<void>;

    /**
     * Pauses retrieval of new messages
     */
    pause();

    /**
     * Resumes retrival of messages
     */
    resume();
}

/**
 * A pending message the producer is holding on to
 */
export interface IPendingMessage {
    // The deferred is used to resolve a promise once the message is sent
    deferred: utils.Deferred<any>;

    // The message to send
    message: string;
}

export interface IProducer {
    /**
     * Sends the message to kafka
     */
    send(message: string, key: string): Promise<any>;

    /**
     * Closes the underlying connection
     */
    close(): Promise<void>;
}
