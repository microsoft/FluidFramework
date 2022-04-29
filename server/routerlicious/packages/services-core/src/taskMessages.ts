/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Message for the task.
 */
export interface ITaskMessage {

    type: string;

    content: any;
}

/**
 * Type of agent and name.
 */
export interface IAgent {

    type: string;

    name: string;
}

/**
 * Interface to implement the agent loader.
 */
export interface IAgentUploader {

    /**
     * Preps the underlying storage.
     */
    initialize(): Promise<void>;

    /**
     * Notifies on the event of an agent added/deleted.
     */
    on(event: "agentAdded" | "agentRemoved", listener: (message: IAgent) => void): this;

    /**
     * Notifies on error.
     */
    on(event: string, listener: (...args: any[]) => void): this;

}

/**
 * Interface to implement the task sender.
 */
export interface ITaskMessageSender {

    /**
     * Preps the underlying message queue.
     */
    initialize(): Promise<void>;

    /**
     * Sends a task message for a document to a queue.
     */
    sendTask(queueName: string, message: ITaskMessage): void;

    /**
     * Notifies on error.
     */
    on(event: string, listener: (...args: any[]) => void): this;

    /**
     * Notifies on error.
     */
    close(): Promise<void>;
}

/**
 * Interface to implement the task receiver.
 */
export interface ITaskMessageReceiver {

    /**
     * Preps the underlying message queue.
     */
    initialize(): Promise<void>;

    /**
     * Notifies on error.
     */
    on(event: string, listener: (...args: any[]) => void): this;

    /**
     * Notifies on error.
     */
    close(): Promise<void>;
}
