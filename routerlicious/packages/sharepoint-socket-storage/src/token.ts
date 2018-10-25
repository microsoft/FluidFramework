import { ITokenProvider } from "@prague/runtime-definitions";

export class TokenProvider implements ITokenProvider {
    public storageToken: string;
    public deltaStorageToken: string;
    public deltaStreamToken: string;

    constructor(deltaStorageToken: string, deltaStreamToken: string) {
        this.deltaStorageToken = deltaStorageToken;
        this.deltaStreamToken = deltaStreamToken;
    }
}
