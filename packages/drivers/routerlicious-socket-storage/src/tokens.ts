import { ITokenClaims, ITokenProvider, ITokenService } from "@prague/container-definitions";
import * as jwtDecode from "jwt-decode";

/**
 * Extracts the claims contained within a token.
 */
export class TokenService implements ITokenService {
    public extractClaims(token: string): ITokenClaims {
        return jwtDecode(token) as ITokenClaims;
    }
}

/**
 * Checks the validation of a token.
 */
export class TokenProvider implements ITokenProvider {

    constructor(public token: string) {
    }

    public isValid(): boolean {
        return (this.token !== undefined && this.token !== null);
    }
}
