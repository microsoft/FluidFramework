/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as jose from "jose";
import type { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import type { RouterliciousMember } from "./interfaces";

/**
 * Token Provider implementation for connecting to an Azure Function endpoint for
 * Azure Fluid Relay token resolution.
 */
export class RouterliciousFunctionTokenProvider implements ITokenProvider {
    /**
     * Creates a new instance using configuration parameters.
     * @param azFunctionUrl - URL to Azure Function endpoint
     * @param user - User object
     */
    constructor(
        private readonly tenantKey: string,
        private readonly user?: Pick<RouterliciousMember, "userId" | "userName" | "additionalDetails">,
    ) { }

    public async fetchOrdererToken(tenantId: string, documentId?: string): Promise<ITokenResponse> {
        return {
            jwt: await this.getToken(tenantId, documentId),
        };
    }

    public async fetchStorageToken(tenantId: string, documentId: string): Promise<ITokenResponse> {
        return {
            jwt: await this.getToken(tenantId, documentId),
        };
    }

    private async getToken(tenantId: string, documentId?: string): Promise<string> {
        const secret = new TextEncoder().encode(this.tenantKey);
        return new jose.SignJWT({
            user: this.user,
            documentId,
            tenantId,
            scopes: ["doc:read", "doc:write", "summary:write"],
            nonce: Date.now(),
            exp: Math.floor(Date.now() / 1000) + 60 * 60
        }).setProtectedHeader({alg: 'HS256'}).sign(secret);
    }
}