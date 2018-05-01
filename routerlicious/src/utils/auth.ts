import * as jwt from "jsonwebtoken";
import * as utils from "../utils";

export interface ITenantUser {
    id: string;
}

// Find a home for this
export interface ITokenClaims {
    documentId: string;
    permission: string;
    tenantId: string;
    user: ITenantUser;
}

/**
 * Generates a JWT token to authorize routerlicious
 */
export function generateToken(tenantId: string, documentId: string, key: string): string {
    const userId = utils.getRandomName(" ", true);
    const claims: ITokenClaims = {
        documentId,
        permission: "read:write",
        tenantId,
        user: {
            id: userId,
        },
    };

    return jwt.sign(claims, key);
}
