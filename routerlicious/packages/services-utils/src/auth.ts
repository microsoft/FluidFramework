import { ITokenClaims, IUser } from "@prague/runtime-definitions";
import * as jwt from "jsonwebtoken";
import { getRandomName } from "./dockerNames";

/**
 * Generates a JWT token to authorize routerlicious
 */
export function generateToken(tenantId: string, documentId: string, key: string, user?: IUser): string {
    user = (user) ? user : generateUser();
    const claims: ITokenClaims = {
        documentId,
        permission: "read:write",
        tenantId,
        user,
    };

    return jwt.sign(claims, key);
}

export function generateUser(): IUser {
    return {
        id: getRandomName(" ", true),
    };
}
