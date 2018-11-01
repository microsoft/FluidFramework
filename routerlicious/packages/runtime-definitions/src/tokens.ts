import { IUser } from "./users";

export interface ITokenClaims {
    documentId: string;
    permission: string;
    tenantId: string;
    user: IUser;
}

/**
 * The ITokenService abstracts the discovery of cliams contained within a token
 */
export interface ITokenService {
    extractClaims(token: string): ITokenClaims;
}

export interface ITokenProvider {
    isValid(): boolean;
}
