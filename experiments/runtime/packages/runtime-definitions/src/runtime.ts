import { ISequencedDocumentMessage } from "./protocol";

/**
 * Message handler definition
 */
export interface IMessageHandler {
    prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    process(message: ISequencedDocumentMessage, context: any, local: boolean): void;
}

export interface IRuntime {
    /**
     * Registers a new handler for the given operation type. After registration ops of the given
     * type will be routed to the provided handler.
     */
    registerHandler(type: string, handler: IMessageHandler);
}
