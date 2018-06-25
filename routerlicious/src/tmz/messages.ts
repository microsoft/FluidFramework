// tslint:disable:ban-types
/**
 * Message sent by the sender.
 */
export interface IMessage {

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
    initialize(): void;

    /**
     * Notifies on the event of an agent added/deleted.
     */
    on(event: "agentAdded" | "agentRemoved", listener: (message: IAgent) => void): this;

    /**
     * Notifies on error.
     */
    on(event: string, listener: Function): this;

}

/**
 * Interface to implement the task/agent broadcaster.
 */
export interface IMessageSender {

    /**
     * Preps the underlying message queue.
     */
    initialize(): Promise<void>;

    /**
     * Sends a task message for a document to a queue.
     */
    sendTask(queueName: string, message: IMessage): void;

    /**
     * Sends an agent loading message.
     */
    sendAgent(message: IMessage): void;

    /**
     * Notifies on error.
     */
    on(event: string, listener: Function): this;

    /**
     * Notifies on error.
     */
    close(): Promise<void>;
}
