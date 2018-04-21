import * as jwt from "jsonwebtoken";
import * as api from "../api-core";
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
export function generateToken(tenantManager: api.ITenantManager, tenantId: string, documentId: string): string {
    const user = utils.getRandomName();
    const claims: ITokenClaims = {
        documentId,
        permission: "read:write",
        tenantId,
        user,
    };
    const key = null;

    return jwt.sign(claims, key);
}
