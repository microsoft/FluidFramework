/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { KJUR as jsrsasign } from "jsrsasign";
import { v4 as uuid } from "uuid";

/**
 * IMPORTANT: This function is duplicated in ./packages/runtime/test-runtime-utils/src/generateToken.ts. There is no
 * need for different implementations, so they should be kept in sync if changes are needed.
 *
 * The reason they are duplicated is because we don't want the core Fluid libraries depending on the Azure libraries
 * (enforced by layer-check), but both need to expose this function. The test-runtime-utils library is a test lib, which
 * layer-check (correctly) reuires only be used as a dev dependency. But in the azure case, we want the function
 * exported, so it needs to be sourced from either the package itself or a non-dev dependency.
 *
 * The previous solution to this was to import the function from azure-service-utils into test-runtime-utils, but that
 * no longer works because the azure packages are in a separate release group.
 *
 * If a token needs to be generated on the client side, you should re-use this function. If you need service-side token
 * generation, you should use the function available in the server-services-client package in order to avoid
 * interdependencies between service and client packages.
 */

/**
 * Generates a JWT token to authorize access to a Routerlicious-based Fluid service. This function uses a browser
 * friendly auth library (jsrsasign) and should only be used in client (browser) context.
 */
export function generateToken(
    tenantId: string,
    key: string,
    scopes: ScopeType[],
    documentId?: string,
    user?: IUser,
    lifetime: number = 60 * 60,
    ver: string = "1.0"): string {
    let userClaim = (user) ? user : generateUser();
    if (userClaim.id === "" || userClaim.id === undefined) {
        userClaim = generateUser();
    }

    // Current time in seconds
    const now = Math.round(Date.now() / 1000);
    const docId = documentId ?? "";

    const claims: ITokenClaims & { jti: string } = {
        documentId: docId,
        scopes,
        tenantId,
        user: userClaim,
        iat: now,
        exp: now + lifetime,
        ver,
        jti: uuid(),
    };

    const utf8Key = { utf8: key };
    return jsrsasign.jws.JWS.sign(null, JSON.stringify({ alg: "HS256", typ: "JWT" }), claims, utf8Key);
}

export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: uuid(),
    };

    return randomUser;
}
