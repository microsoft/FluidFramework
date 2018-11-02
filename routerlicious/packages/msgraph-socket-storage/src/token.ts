import { ITokenProvider } from "@prague/runtime-definitions";

export class TokenProvider implements ITokenProvider {

    constructor(public storageToken: string, public socketToken: string) {
    }

    public isValid(): boolean {
        // The delta stream needs a token. The other endpoints can have cookie based auth
        return (this.socketToken !== undefined && this.socketToken !== null);
    }
}
