/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { LocalResolver } from "@fluidframework/local-driver";
import { InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { getRandomName } from "@fluidframework/server-services-client";
import { RouteOptions, IDevServerUser } from "./loader";
import { OdspUrlResolver } from "./odspUrlResolver";

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

function getUrlResolver(options: RouteOptions): IUrlResolver {
    switch (options.mode) {
        case "docker":
            return new InsecureUrlResolver(
                dockerUrls.hostUrl,
                dockerUrls.ordererUrl,
                dockerUrls.storageUrl,
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);

        case "r11s":
            return new InsecureUrlResolver(
                options.fluidHost,
                options.fluidHost.replace("www", "alfred"),
                options.fluidHost.replace("www", "historian"),
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);
        case "tinylicious":
            return new InsecureUrlResolver(
                tinyliciousUrls.hostUrl,
                tinyliciousUrls.ordererUrl,
                tinyliciousUrls.storageUrl,
                "tinylicious",
                "12345",
                getUser(),
                options.bearerSecret);

        case "spo":
        case "spo-df":
            return new OdspUrlResolver(
                options.server,
                { accessToken: options.odspAccessToken });

        default: // Local
            return new LocalResolver();
    }
}

const getUser = (): IDevServerUser => ({
    id: uuid(),
    name: getRandomName(),
});

export class MultiUrlResolver implements IUrlResolver {
    private readonly urlResolver: IUrlResolver;
    constructor(
        private readonly documentId: string,
        private readonly rawUrl: string,
        private readonly options: RouteOptions,
        private readonly useLocalResolver: boolean = false,
    ) {
        if (this.useLocalResolver) {
            this.urlResolver = new LocalResolver();
        } else {
            this.urlResolver = getUrlResolver(options);
        }
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

    public async createRequestForCreateNew(
        fileName: string,
    ): Promise<IRequest> {
        if (this.useLocalResolver) {
            return (this.urlResolver as LocalResolver).createCreateNewRequest(fileName);
        }
        switch (this.options.mode) {
            case "r11s":
            case "docker":
            case "tinylicious":
                return (this.urlResolver as InsecureUrlResolver).createCreateNewRequest(fileName);

            case "spo":
            case "spo-df":
                return (this.urlResolver as OdspUrlResolver).createCreateNewRequest(fileName);

            default: // Local
                return (this.urlResolver as LocalResolver).createCreateNewRequest(fileName);
        }
    }
}
