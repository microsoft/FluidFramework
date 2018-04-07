import * as api from "../../api-core";
import { IAuthenticatedUser } from "../../core-utils";

export class TestDocumentDeltaConnection implements api.IDocumentDeltaConnection {

    constructor(
        public documentId: string,
        public clientId: string,
        public existing: boolean,
        public parentBranch: string,
        public user: IAuthenticatedUser) {
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

    public disconnect() {
        return;
    }
}
