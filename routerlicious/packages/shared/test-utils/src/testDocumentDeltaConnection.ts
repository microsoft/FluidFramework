import {
    IContentMessage,
    IDocumentDeltaConnection,
    IDocumentMessage,
    ISequencedDocumentMessage,
} from "@prague/container-definitions";
import { EventEmitter } from "events";

export class TestDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
    public readonly maxMessageSize = 16 * 1024;

    constructor(
        public documentId: string,
        public clientId: string,
        public existing: boolean,
        public parentBranch: string,
        public initialMessages: ISequencedDocumentMessage[] | undefined,
        public initialContents: IContentMessage[] | undefined) {
        super();
    }

    /**
     * Subscribe to events emitted by the document
     */
    public on(event: string, listener: (...args: any[]) => void): this {
        return this;
    }

    /**
     * Submits a new delta operation to the server
     */
    public submit(message: IDocumentMessage): void {
        return;
    }

    /**
     * Submits a new signal to the server
     */
    public submitSignal(message: IDocumentMessage): void {
        return;
    }

    public async submitAsync(message: IDocumentMessage): Promise<void> {
        return;
    }

    public disconnect() {
        return;
    }
}
