/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { assert } from "@fluidframework/common-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
    DriverHeader,
} from "@fluidframework/driver-definitions";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { generateToken } from "./auth";

export function createLocalResolverCreateNewRequest(documentId: string): IRequest {
    const createNewRequest: IRequest = {
        url: `http://localhost:3000/${documentId}`,
        headers: {
            [DriverHeader.createNew]: true,
        },
    };
    return createNewRequest;
}

/**
 * Resolves URLs by providing fake URLs which succeed with the other
 * related local classes.
 */
export class LocalResolver implements IUrlResolver {
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
        const fullPath = parsedUrl.pathname.substr(1);
        const documentId = fullPath.split("/")[0];
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: `http://localhost:3000/deltas/${this.tenantId}/${documentId}`,
                ordererUrl: "http://localhost:3000",
                storageUrl: `http://localhost:3000/repos/${this.tenantId}`,
            },
            tokens: { jwt: generateToken(this.tenantId, documentId, this.tokenKey, scopes) },
            type: "fluid",
            url: `fluid-test://localhost:3000/${this.tenantId}/${fullPath}`,
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
        assert(!!documentId, "The resolvedUrl must have a documentId");

        return `http://localhost:3000/${documentId}/${url}`;
    }

    public createCreateNewRequest(documentId: string): IRequest {
        return createLocalResolverCreateNewRequest(documentId);
    }
}
