import { ITokenProvider } from "@prague/runtime-definitions";
export declare class TokenProvider implements ITokenProvider {
    storageToken: string;
    deltaStorageToken: string;
    deltaStreamToken: string;
    constructor(deltaStorageToken: string, deltaStreamToken: string);
}
