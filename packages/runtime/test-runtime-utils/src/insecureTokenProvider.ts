/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType, IUser } from "@fluidframework/protocol-definitions";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import { generateToken } from "./generateToken";

/**
 * As the name implies this is not secure and should not be used in production. It simply makes the example easier
 * to get up and running.
 */
export class InsecureTokenProvider implements ITokenProvider {
    constructor(
        private readonly tenantKey: string,
        private readonly user: IUser,
    ) {

    }

    public async fetchOrdererToken(tenantId: string, documentId?: string): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: generateToken(
                tenantId,
                this.tenantKey,
                [
                    ScopeType.DocRead,
                    ScopeType.DocWrite,
                    ScopeType.SummaryWrite,
                ],
                documentId,
                this.user,
            ),
        };
    }

    public async fetchStorageToken(tenantId: string, documentId: string): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: generateToken(
                tenantId,
                this.tenantKey,
                [
                    ScopeType.DocRead,
                    ScopeType.DocWrite,
                    ScopeType.SummaryWrite,
                ],
                documentId,
                this.user,
            ),
        };
    }
}
