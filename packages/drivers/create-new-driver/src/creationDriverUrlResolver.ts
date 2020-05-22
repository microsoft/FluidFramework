/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { parse } from "url";
import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IFluidResolvedUrl, IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";

export class CreationDriverUrlResolver implements IUrlResolver {
    constructor() { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const [, queryString] = request.url.split("?");

        const searchParams = new URLSearchParams(queryString);

        const uniqueId = searchParams.get("uniqueId");
        if (uniqueId === null) {
            throw new Error("URL for creation driver should contain the uniqueId");
        }
        const response: IFluidResolvedUrl = {
            endpoints: { snapshotStorageUrl: "" },
            tokens: {},
            type: "fluid",
            url: `fluid-creation://placeholder/placeholder/${uniqueId}`,
        };

        return response;
    }

    public async requestUrl(
        resolvedUrl: IResolvedUrl,
        request: IRequest,
    ): Promise<IResponse> {
        let url = request.url;
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

        const response: IResponse = {
            mimeType: "text/plain",
            value: `/${url}?uniqueId=${documentId}`,
            status: 200,
        };
        return response;
    }
}
