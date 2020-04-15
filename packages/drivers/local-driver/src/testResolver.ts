/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
    IExperimentalUrlResolver,
    OpenMode,
} from "@microsoft/fluid-driver-definitions";
import { ScopeType } from "@microsoft/fluid-protocol-definitions";
import { generateToken } from "@microsoft/fluid-server-services-client";

/**
 * Resolves URLs by providing fake URLs which succeed with the other
 * related test classes.
 */
export class TestResolver implements IUrlResolver, IExperimentalUrlResolver {
    public readonly isExperimentalUrlResolver = true;
    private readonly tenantId = "tenantId";
    private readonly tokenKey = "tokenKey";

    constructor(
        private readonly id: string = "documentId",
    ) {}

    /**
     * Resolves URL requests by providing fake URLs with an actually generated
     * token from constant test strings.  The root of the URL is fake, but the
     * remaining relative URL can still be parsed.
     * @param request - request to handle; not used
     */
    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        return this.resolveHelper();
    }

    private resolveHelper() {
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: `http://localhost:3000/deltas/${this.tenantId}/${this.id}`,
                ordererUrl: "http://localhost:3000",
                storageUrl: `http://localhost:3000/repos/${this.tenantId}`,
            },
            tokens: { jwt: generateToken(this.tenantId, this.id, this.tokenKey, scopes) },
            type: "fluid",
            url: `fluid-test://localhost:3000/${this.tenantId}/${this.id}`,
        };

        return resolved;
    }

    public async requestUrl(resolvedUrl: IResolvedUrl, request: IRequest): Promise<IResponse> {
        let url = request.url;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        const response: IResponse = {
            mimeType: "text/plain",
            value: `https://localhost:3000/${this.tenantId}/${this.id}/${request.url}`,
            status: 200,
        };
        return response;
    }

    public createCreateNewRequest(): IRequest {
        const createNewRequest: IRequest = {
            url: `http://localhost:3000/${this.tenantId}/${this.id}`,
            headers: {
                openMode: OpenMode.CreateNew,
            },
        };
        return createNewRequest;
    }
}
