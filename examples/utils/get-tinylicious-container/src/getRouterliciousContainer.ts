/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import jwt from "jsonwebtoken";
import { IRuntimeFactory } from "@fluidframework/container-definitions";
import { IUrlResolver, IFluidResolvedUrl, IResolvedUrl } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { getContainer } from "./getContainer";

class RouterliciousUrlResolver implements IUrlResolver {
    constructor(private readonly token: string, private readonly rootUrl: string) {
    }

    public async resolve(request: IRequest): Promise<IFluidResolvedUrl> {
        const documentUrl = `https://www.${this.rootUrl}/fluid/${request.url}`;

        return Promise.resolve({
            endpoints: {
                deltaStorageUrl: `https://alfred.${this.rootUrl}/deltas/fluid/${request.url}`,
                ordererUrl: `https://alfred.${this.rootUrl}`,
                storageUrl: `https://historian.${this.rootUrl}/repos/fluid`,
            },
            tokens: { jwt: this.token },
            type: "fluid",
            url: documentUrl,
        });
    }
    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        if (resolvedUrl.type !== "fluid") {
            throw Error("Invalid Resolved Url");
        }
        return `${resolvedUrl.url}/${relativeUrl}`;
    }
}

export async function getRouterliciousContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
) {
    const documentServiceFactory = new RouterliciousDocumentServiceFactory();

    const user = {
        id: "unique-id",
        name: "Unique Idee",
    };

    const hostToken = jwt.sign(
        {
            user,
            documentId,
            tenantId: "",
            scopes: ["doc:read", "doc:write", "summary:write"],
        },
        "");

    const urlRoot = "";
    const urlResolver = new RouterliciousUrlResolver(hostToken, urlRoot);

    return getContainer(
        documentId,
        createNew,
        { url: documentId },
        urlResolver,
        documentServiceFactory,
        containerRuntimeFactory,
    );
}
