import { ITokenClaims, ITokenService } from "@prague/runtime-definitions";
import * as jwtDecode from "jwt-decode";

export class TokenService implements ITokenService {
    public extractClaims(token: string): ITokenClaims {
        // tslint:disable-next-line:no-unsafe-any
        return jwtDecode(token) as ITokenClaims;
    }
}
