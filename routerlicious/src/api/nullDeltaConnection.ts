import * as api from "../api-core";
import { IAuthenticatedUser } from "../core-utils";

/**
 * Delta connection used when not connected to the server (i.e. loading an old version)
 */
export class NullDeltaConnection implements api.IDocumentDeltaConnection {
    public clientId: string = "offline-client";
    public encrypted: boolean = false;
    public privateKey: string = null;
    public publicKey: string = null;
    public existing: boolean = true;
    public user: IAuthenticatedUser = null;

    constructor(public documentId: string, public parentBranch: string) {
    }

    public on(event: string, listener: Function): this {
        return this;
    }

    public submit(message: api.IDocumentMessage): Promise<void> {
        return Promise.resolve();
    }

    public disconnect() {
        return;
    }
}
