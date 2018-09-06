import { ITokenClaims } from "@prague/runtime-definitions";
import * as jwt from "jsonwebtoken";
import * as utils from "../utils";

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
