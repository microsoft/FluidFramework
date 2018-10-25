import { ITokenClaims, ITokenProvider, ITokenService } from "@prague/runtime-definitions";
import * as jwtDecode from "jwt-decode";

export class TokenService implements ITokenService {
    public extractClaims(token: string): ITokenClaims {
        return jwtDecode(token) as ITokenClaims;
    }
}

export class TokenProvider implements ITokenProvider {
    public storageToken: string;
    public deltaStorageToken: string;
    public deltaStreamToken: string;

    constructor(token: string) {
        this.storageToken = token;
        this.deltaStorageToken = token;
        this.deltaStreamToken = token;
    }
}
