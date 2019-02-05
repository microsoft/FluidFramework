import { ITokenClaims, ITokenProvider, ITokenService } from "@prague/container-definitions";
import * as jwtDecode from "jwt-decode";

export class TokenService implements ITokenService {
    public extractClaims(token: string): ITokenClaims {
        return jwtDecode(token) as ITokenClaims;
    }
}

export class TokenProvider implements ITokenProvider {

    constructor(public token: string) {
    }

    public isValid(): boolean {
        return (this.token !== undefined && this.token !== null);
    }
}
