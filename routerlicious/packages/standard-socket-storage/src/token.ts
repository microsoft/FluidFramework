import { ITokenProvider } from "@prague/container-definitions";

export class TokenProvider implements ITokenProvider {

    /**
     * Storage token - for snapshots and delta storage
     */
    public readonly storageToken: string;

    /**
     * Socket token - for the delta stream (websockets)
     */
    public readonly socketToken: string;

    constructor(storageToken: string, socketToken: string) {
        this.storageToken = storageToken;
        this.socketToken = socketToken;
    }

    public isValid(): boolean {
        // The delta stream needs a token. The other endpoints can have cookie based auth
        return !!this.socketToken;
    }
}
