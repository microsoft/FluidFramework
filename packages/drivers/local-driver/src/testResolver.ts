/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { parse } from "url";
import { IRequest } from "@fluidframework/component-core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
    CreateNewHeader,
} from "@fluidframework/driver-definitions";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { generateToken } from "@fluidframework/server-services-client";

/**
 * Resolves URLs by providing fake URLs which succeed with the other
 * related test classes.
 */
export class TestResolver implements IUrlResolver {
    private readonly tenantId = "tenantId";
    private readonly tokenKey = "tokenKey";

    constructor() { }

    /**
     * Resolves URL requests by providing fake URLs with an actually generated
     * token from constant test strings. The root of the URL is fake, but the
     * remaining relative URL can still be parsed.
     * @param request - request to handle
     */
    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const parsedUrl = new URL(request.url);
        const documentId = parsedUrl.pathname.substr(1).split("/")[0];
        return this.resolveHelper(documentId);
    }

    private resolveHelper(documentId: string) {
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: `http://localhost:3000/deltas/${this.tenantId}/${documentId}`,
                ordererUrl: "http://localhost:3000",
                storageUrl: `http://localhost:3000/repos/${this.tenantId}`,
            },
            tokens: { jwt: generateToken(this.tenantId, documentId, this.tokenKey, scopes) },
            type: "fluid",
            url: `fluid-test://localhost:3000/${this.tenantId}/${documentId}`,
        };

        return resolved;
    }

    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        let url = relativeUrl;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        const fluidResolvedUrl = resolvedUrl as IFluidResolvedUrl;

        const parsedUrl = parse(fluidResolvedUrl.url);
        if (parsedUrl.pathname === undefined) {
            throw new Error("Url should contain tenant and docId!!");
        }
        const [, , documentId] = parsedUrl.pathname.split("/");
        assert(documentId, "The resolvedUrl must have a documentId");

        return `http://localhost:3000/${documentId}/${url}`;
    }

    public createCreateNewRequest(documentId: string): IRequest {
        const createNewRequest: IRequest = {
            url: `http://localhost:3000/${documentId}`,
            headers: {
                [CreateNewHeader.createNew]: true,
            },
        };
        return createNewRequest;
    }
}
