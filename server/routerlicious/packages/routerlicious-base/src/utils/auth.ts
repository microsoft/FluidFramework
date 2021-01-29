/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITenantManager } from "@fluidframework/server-services-core";
import { validateTokenClaims } from "@fluidframework/server-services-utils";
import { Request } from "express";
import { getParam } from "./params";

/**
 * Verifies the storage token claims and calls riddler to validate the token.
 */
// eslint-disable-next-line max-len
export async function verifyStorageToken(request: Request, tenantManager: ITenantManager, maxTokenLifetimeSec: number, isTokenExpiryEnabled: boolean): Promise<void> {
    const authorizationHeader = request.header("Authorization");
    const regex = /Basic (.+)/;
    const tokenMatch = regex.exec(authorizationHeader);
    if (!tokenMatch || !tokenMatch[1]) {
        return Promise.reject(new Error("Missing access token"));
    }
    const token = tokenMatch[1];
    const tenantId = getParam(request.params, "tenantId");
    const documentId = getParam(request.params, "id") || request.body.id;
    const claims = validateTokenClaims(token, documentId, tenantId, maxTokenLifetimeSec, isTokenExpiryEnabled);
    if (!claims) {
        return Promise.reject(new Error("Invalid access token"));
    }
    return tenantManager.verifyToken(claims.tenantId, token);
}
