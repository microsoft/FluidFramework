import * as jwt from "jsonwebtoken";
import * as utils from "../utils";

// Find a home for this
export interface ITokenClaims {
    documentId: string;
    permission: string;
    tenantId: string;
    user: string;
}

/**
 * Generates a JWT token to authorize routerlicious
 */
export function generateToken(tenantId: string, documentId: string, key: string): string {
    const user = utils.getRandomName();
    const claims: ITokenClaims = {
        documentId,
        permission: "read:write",
        tenantId,
        user,
    };

    return jwt.sign(claims, key);
}
