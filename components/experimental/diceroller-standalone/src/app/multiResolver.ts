/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/component-core-interfaces";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { getRandomName } from "@fluidframework/server-services-client";
import { InsecureUrlResolver } from "./insecureUrlResolver";
import { IDevServerUser, ITinyliciousRouteOptions } from "./loader";

export const dockerUrls = {
    hostUrl: "http://localhost:3000",
    ordererUrl: "http://localhost:3003",
    storageUrl: "http://localhost:3001",
};

export const tinyliciousUrls = {
    hostUrl: "http://localhost:3000",
    ordererUrl: "http://localhost:3000",
    storageUrl: "http://localhost:3000",
};

const getUser = (): IDevServerUser => ({
    id: uuid(),
    name: getRandomName(),
});

export class MultiUrlResolver implements IUrlResolver {
    private readonly urlResolver: IUrlResolver;
    constructor(
        private readonly rawUrl: string,
        private readonly documentId: string,
        options: ITinyliciousRouteOptions) {
        this.urlResolver = new InsecureUrlResolver(
            tinyliciousUrls.hostUrl,
            tinyliciousUrls.ordererUrl,
            tinyliciousUrls.storageUrl,
            "tinylicious",
            "12345",
            getUser(),
            options.bearerSecret!,
            documentId,
        );
    }

    async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        let url = relativeUrl;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        return `${this.rawUrl}/${this.documentId}/${url}`;
    }

    async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        return this.urlResolver.resolve(request);
    }

    public createRequestForCreateNew(
        fileName: string,
    ): IRequest {
        return (this.urlResolver as InsecureUrlResolver).createCreateNewRequest(fileName);
    }
}
