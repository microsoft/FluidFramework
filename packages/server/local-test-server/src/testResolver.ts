/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@prague/component-core-interfaces";
import { IFluidResolvedUrl, IResolvedUrl, IUrlResolver, ScopeType } from "@prague/protocol-definitions";
import { generateToken } from "@prague/services-core";

/**
 * Resolves URLs by providing fake URLs which succeed with the other
 * related test classes in the local-test-server suite of implementations.
 */
export class TestResolver implements IUrlResolver {
    private id = "documentId";
    private tenantId = "tenantId";
    private tokenKey = "tokenKey";

    /**
     * Resolves URL requests by providing fake URLs with an actually generated
     * token from constant test strings.  The root of the URL is fake, but the
     * remaining relative URL can still be parsed.
     * @param request - request to handle; not used
     */
    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: "test.com",
                ordererUrl: "test.com",
                storageUrl: "test.com",
            },
            tokens: { jwt: generateToken(this.tenantId, this.id, this.tokenKey, scopes) },
            type: "prague",
            url: `fluid-test://test.com/${this.tenantId}/${this.id}`,
        };

        return resolved;
    }
}
