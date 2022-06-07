/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType, IUser } from "@fluidframework/protocol-definitions";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import { generateToken } from "./generateToken";

/**
 * {@link @fluidframework/routerlicious-driver#ITokenProvider} intended for **test use only**.
 * As the name implies this is not secure and should not be used in production.
 * It simply makes the example easier to get up and running.
 */
export class InsecureTokenProvider implements ITokenProvider {
    constructor(
        /**
         * TODO
         */
        private readonly tenantKey: string,

        /**
         * TODO
         */
        private readonly user: IUser,
    ) {

    }

    /**
     * {@inheritDoc @fluidframework/routerlicious-driver#ITokenProvider.fetchOrdererToken}
     */
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

    /**
     * {@inheritDoc @fluidframework/routerlicious-driver#ITokenProvider.fetchStorageToken}
     */
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
