import * as api from "../api-core";

/**
 * Delta connection used when not connected to the server (i.e. loading an old version)
 */
export class NullDeltaConnection implements api.IDocumentDeltaConnection {
    public clientId: string = "offline-client";
    public encrypted: boolean = false;
    public privateKey: string = null;
    public publicKey: string = null;

    constructor(public documentId: string) {
    }

    public on(event: string, listener: Function): this {
        return this;
    }

    public submit(message: api.IDocumentMessage): Promise<void> {
        return Promise.resolve();
    }

    public dispatchEvent(name: string, ...args: any[]) {
        return;
    }
}
