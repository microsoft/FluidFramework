import { ITokenProvider } from "@prague/runtime-definitions";

export class TokenProvider implements ITokenProvider {

    constructor(public deltaStorageToken: string, public deltaStreamToken: string) {
    }

    public isValid(): boolean {
        // The delta stream needs a token. The other endpoints can have cookie based auth
        return (this.deltaStreamToken !== undefined && this.deltaStreamToken !== null);
    }
}
