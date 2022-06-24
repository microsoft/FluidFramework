/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { LocalResolver } from "@fluidframework/local-driver";
import { InsecureUrlResolver } from "@fluidframework/driver-utils";
import { assert } from "@fluidframework/common-utils";
import { ITinyliciousRouteOptions, RouteOptions } from "./loader";
import { OdspUrlResolver } from "./odspUrlResolver";

export const dockerUrls = {
    hostUrl: "http://localhost:3000",
    ordererUrl: "http://localhost:3003",
    storageUrl: "http://localhost:3001",
};

const defaultTinyliciousPort = 7070;

export const tinyliciousUrls = (options: ITinyliciousRouteOptions) => {
    const port = options.tinyliciousPort ?? defaultTinyliciousPort;

    return {
        hostUrl: `http://localhost:${port}`,
        ordererUrl: `http://localhost:${port}`,
        storageUrl: `http://localhost:${port}`,
    };
};

function getUrlResolver(options: RouteOptions): IUrlResolver {
    switch (options.mode) {
        case "docker":
            assert(options.tenantId !== undefined, 0x31e /* options.tenantId is undefined */);
            return new InsecureUrlResolver(
                dockerUrls.hostUrl,
                dockerUrls.ordererUrl,
                dockerUrls.storageUrl,
                options.tenantId,
                options.bearerSecret ?? "");

        case "r11s":
            assert(options.tenantId !== undefined, 0x320 /* options.tenantId is undefined */);
            assert(options.bearerSecret !== undefined, 0x321 /* options.bearerSecret is undefined */);
            assert(options.fluidHost !== undefined, 0x322 /* options.fluidHost is undefined */);
            if (options.discoveryEndpoint !== undefined) {
                return new InsecureUrlResolver(
                    "",
                    options.discoveryEndpoint,
                    "https://dummy-historian",
                    options.tenantId,
                    options.bearerSecret);
            }
            return new InsecureUrlResolver(
                options.fluidHost,
                options.fluidHost.replace("www", "alfred"),
                options.fluidHost.replace("www", "historian"),
                options.tenantId,
                options.bearerSecret);
        case "tinylicious": {
            assert(options.bearerSecret !== undefined, 0x323 /* options.bearerSecret is undefined */);
            const urls = tinyliciousUrls(options);
            return new InsecureUrlResolver(
                urls.hostUrl,
                urls.ordererUrl,
                urls.storageUrl,
                "tinylicious",
                options.bearerSecret);
        }
        case "spo":
        case "spo-df":
            assert(options.server !== undefined, 0x324 /* options.server is undefined */);
            assert(options.odspAccessToken !== undefined, 0x325 /* options.odspAccessToken is undefined */);
            return new OdspUrlResolver(
                options.server,
                { accessToken: options.odspAccessToken });

        default: // Local
            return new LocalResolver();
    }
}

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
