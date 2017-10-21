import * as api from "../../api-core";
import { TestDocumentService} from "./";

export class TestDocumentDeltaConnection implements api.IDocumentDeltaConnection {

        constructor(
            public service: TestDocumentService,
            public documentId: string,
            public clientId: string,
            public encrypted: boolean,
            public privateKey: string,
            public publicKey: string) {
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
        public submit(message: api.IDocumentMessage): Promise<void> {
            return Promise.resolve();
        }

        /**
         * Updates the reference sequence number on the given connection to the provided value
         */
        public updateReferenceSequenceNumber(objectId: string, sequenceNumber: number): Promise<void> {
            return Promise.resolve();
        }

        /**
         * Dispatches the given event to any registered listeners.
         * This is an internal method.
         */
        public dispatchEvent(name: string, ...args: any[]) {
            // Dispatch events here.
        }
    }
