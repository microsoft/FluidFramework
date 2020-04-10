/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
    IExperimentalUrlResolver,
    ILocalNewFileParams,
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
        if (request.headers && request.headers.openMode === OpenMode.CreateNew) {
            const [, queryString] = request.url.split("?");

            const searchParams = new URLSearchParams(queryString);
            const fileName = searchParams.get("fileName");
            const siteUrl = searchParams.get("siteUrl");
            const tenantId = searchParams.get("tenantId");
            if (!(fileName && siteUrl && tenantId)) {
                throw new Error("Proper new file params should be there!!");
            }
            const newFileParams: ILocalNewFileParams = {
                fileName,
                siteUrl,
                tenantId,
            };
            const resolved: IFluidResolvedUrl = {
                endpoints: {},
                tokens: {},
                type: "fluid",
                url: `fluid-test://localhost:3000/${this.tenantId}/${this.id}`,
                siteUrl: "https://localhost:3000",
                newFileParams,
            };
            return resolved;
        }
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

    public createUrl(resolvedUrl: IResolvedUrl, request: IRequest): string {
        return `https://localhost:3000/${this.tenantId}/${this.id}${request.url}`;
    }
}
