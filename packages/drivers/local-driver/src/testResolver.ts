/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IFluidResolvedUrl, IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { ScopeType } from "@microsoft/fluid-protocol-definitions";
import { generateToken } from "@microsoft/fluid-server-services-client";

/**
 * Resolves URLs by providing fake URLs which succeed with the other
 * related test classes.
 */
export class TestResolver implements IUrlResolver {
    private readonly tenantId = "tenantId";
    private readonly tokenKey = "tokenKey";

    constructor(private readonly id: string = "documentId") {
    }

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
            type: "fluid",
            url: `fluid-test://test.com/${this.tenantId}/${this.id}`,
        };

        return resolved;
    }
}
