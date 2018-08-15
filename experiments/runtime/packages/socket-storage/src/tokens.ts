import { ITokenClaims, ITokenService } from "@prague/runtime-definitions";
import * as jwt from "jsonwebtoken";

export class TokenService implements ITokenService {
    public extractClaims(token: string): ITokenClaims {
        return jwt.decode(token) as ITokenClaims;
    }
}
