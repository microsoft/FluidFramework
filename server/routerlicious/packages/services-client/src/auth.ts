/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from "util";
import { ITokenClaims, IUser, ScopeType } from "@microsoft/fluid-protocol-definitions";
import * as jwt from "jsonwebtoken";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { getRandomName } from "./dockerNames";

export interface IAlfredTenant {
    id: string;
    key: string;
}

/**
 * Generates a JWT token to authorize routerlicious
 */
export function generateToken(
    tenantId: string,
    documentId: string,
    key: string,
    scopes: ScopeType[],
    user?: IUser): string {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define, no-param-reassign
    user = (user) ? user : generateUser();
    if (user.id === "" || user.id === undefined) {
        debug("User with no id");
        // eslint-disable-next-line @typescript-eslint/no-use-before-define, no-param-reassign
        user = generateUser();
    }

    const claims: ITokenClaims = {
        documentId,
        scopes,
        tenantId,
        user,
    };

    return jwt.sign(claims, key);
}

export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: getRandomName(" ", true),
    };

    return randomUser;
}
