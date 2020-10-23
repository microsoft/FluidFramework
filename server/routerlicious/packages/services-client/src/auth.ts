/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims } from "@fluidframework/protocol-definitions";
import jwtDecode from "jwt-decode";

/**
 * Validates a JWT token to authorize routerlicious and returns decoded claims.
 * An undefined return value indicates invalid claims.
 */
export function validateTokenClaims(
    token: string,
    documentId: string,
    tenantId: string,
    maxTokenLifetimeSec: number,
    isTokenExpiryEnabled: boolean): ITokenClaims {
    const claims = jwtDecode<ITokenClaims>(token);

    if (!claims
        || claims.documentId !== documentId
        || claims.tenantId !== tenantId
    ) {
        return undefined;
    }

    if (isTokenExpiryEnabled === true) {
        const now = Math.round((new Date()).getTime() / 1000);
        if (now >= claims.exp || claims.exp - claims.iat > maxTokenLifetimeSec) {
            return undefined;
        }
    }

    return claims;
}
