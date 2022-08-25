/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { KJUR as jsrsasign } from "jsrsasign";
import { v4 as uuid } from "uuid";

/**
 * IMPORTANT: This function is duplicated in ./azure/packages/azure-service-utils/src/generateToken.ts. There is no need
 * for different implementations, so they should be kept in sync if changes are needed.
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
 * Generates a {@link https://en.wikipedia.org/wiki/JSON_Web_Token | JSON Web Token} (JWT)
 * to authorize access to a Routerlicious-based Fluid service.
 *
 * @remarks Note: this function uses a browser friendly auth library
 * ({@link https://www.npmjs.com/package/jsrsasign | jsrsasign}) and may only be used in client (browser) context.
 * It is **not** Node.js-compatible.
 *
 * @param tenantId - See {@link @fluidframework/protocol-definitions#ITokenClaims.tenantId}
 * @param key - API key to authenticate user. Must be {@link https://en.wikipedia.org/wiki/UTF-8 | UTF-8}-encoded.
 * @param scopes - See {@link @fluidframework/protocol-definitions#ITokenClaims.scopes}
 * @param documentId - See {@link @fluidframework/protocol-definitions#ITokenClaims.documentId}.
 * If not specified, the token will not be associated with a document, and an empty string will be used.
 * @param user - User with whom generated tokens will be associated.
 * If not specified, the token will not be associated with a user, and a randomly generated mock user will be
 * used instead.
 * See {@link @fluidframework/protocol-definitions#ITokenClaims.user}
 * @param lifetime - Used to generate the {@link @fluidframework/protocol-definitions#ITokenClaims.exp | expiration}.
 * Expiration = now + lifetime.
 * Expressed in seconds.
 * Default: 3600 (1 hour).
 * @param ver - See {@link @fluidframework/protocol-definitions#ITokenClaims.ver}.
 * Default: `1.0`.
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

    const claims: ITokenClaims & { jti: string; } = {
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

/**
 * Generates an arbitrary ("random") {@link @fluidframework/protocol-definitions#IUser} by generating a
 * random UUID for its {@link @fluidframework/protocol-definitions#IUser.id} and `name` properties.
 */
export function generateUser(): IUser {
    const randomUser = {
        id: uuid(),
        name: uuid(),
    };

    return randomUser;
}
