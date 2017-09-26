/**
 * A topic where messages can be published
 */
export interface ITopic {
    /**
     * Emits an event to the topic
     */
    emit(event: string, ...args: any[]);
}

/**
 * Basic interface used to publish messages to a topic
 */
export interface IPublisher {
    /**
     * Subscribe to events about the publisher
     */
    on(event: string, listener: (...args: any[]) => void);

    /**
     * used to send messages to a topic
     */
    to(topic: string): ITopic;
}
