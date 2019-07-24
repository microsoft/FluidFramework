/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl, IRequest, IResolvedUrl, IUrlResolver } from "@prague/container-definitions";
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
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: "test.com",
                ordererUrl: "test.com",
                storageUrl: "test.com",
            },
            tokens: { jwt: generateToken(this.tenantId, this.id, this.tokenKey) },
            type: "prague",
            url: `prague://test.com/${this.tenantId}/${this.id}`,
        };

        return resolved;
    }
}
