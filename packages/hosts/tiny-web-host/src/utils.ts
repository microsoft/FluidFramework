/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims, ScopeType } from "@microsoft/fluid-protocol-definitions";
import * as jwt from "jsonwebtoken";

export interface IRouterliciousTokenApi {
    getToken(): Promise<string>;
}

export interface IOdspTokenApi {
    getStorageToken(siteUrl: string, refresh: boolean): Promise<string | null>;
    getWebsocketToken(): Promise<string | null>;
}

export type ITokenApis = IRouterliciousTokenApi | IOdspTokenApi;

// This is insecure, but is being used for the time being for ease of use during the hackathon.
async function fetchSecret(tenant: string, getToken: () => Promise<string>): Promise<string> {
    switch (tenant) {
        case "fluid": {
            return "43cfc3fbf04a97c0921fd23ff10f9e4b";
        }
        case "prague":
        case "stupefied-kilby":
        case "elastic-dijkstra":
        case "github":
            throw new Error("In preparation for Fluid going open source, these tenants have been deprecated. " +
                "Please use the \"fluid\" tenant, or provide your own tenant");
        default: {
            if (!getToken) {
                throw new Error("Tenant Not Recognized. No getToken function provided.");
            }
            return getToken();
        }
    }
}

export async function auth(tenantId: string, documentId: string, getToken: () => Promise<string>): Promise<string> {
    const secret = await fetchSecret(tenantId, getToken);

    const claims: ITokenClaims = {
        documentId,
        scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
        tenantId,
        user: { id: "anonymous-coward" },
    };

    return jwt.sign(claims, secret);
}
