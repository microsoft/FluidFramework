/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType, IUser } from "@fluidframework/protocol-definitions";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import { generateToken } from "./generateToken";

/**
 * Provides an in memory implementation of {@link @fluidframework/routerlicious-driver#ITokenProvider} that can be
 * used to insecurely connect to the Fluid Relay.
 *
 * As the name implies, this is not secure and should not be used in production.
 * It simply makes examples where authentication is not relevant easier to bootstrap.
 */
export class InsecureTokenProvider implements ITokenProvider {
    constructor(
        /**
         * Private server tenantKey for generating tokens.
         */
        private readonly tenantKey: string,

        /**
         * User with whom generated tokens will be associated.
         */
        private readonly user: IUser,

        /**
         * Optional. Override of scopes. If a param is not provided, InsecureTokenProvider
         * will use the default scopes which are document read, write and summarizer write.
         *
         * @param scopes - See {@link @fluidframework/protocol-definitions#ITokenClaims.scopes}
         *
         * @defaultValue - [ ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite ]
         */
        private readonly scopes?: ScopeType[],
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
                this.scopes ?? [
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
                this.scopes ?? [
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
