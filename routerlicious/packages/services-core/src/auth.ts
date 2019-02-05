import { ITokenClaims, IUser } from "@prague/container-definitions";
import * as jwt from "jsonwebtoken";
import { debug } from "util";
import * as uuid from "uuid/v4";
import { getRandomName } from "./dockerNames";

/**
 * Generates a JWT token to authorize routerlicious
 */
export function generateToken(tenantId: string, documentId: string, key: string, user?: IUser): string {
    user = (user) ? user : generateUser();
    if (user.id === "" || user.id === undefined) {
        debug("User with no id");
        user = generateUser();
    }

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
        id: uuid(),
        name: getRandomName(" ", true),
    };
}
