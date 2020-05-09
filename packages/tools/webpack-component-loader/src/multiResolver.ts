/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { TestResolver } from "@microsoft/fluid-local-driver";
import { InsecureUrlResolver } from "@microsoft/fluid-test-runtime-utils";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { getRandomName } from "@microsoft/fluid-server-services-client";
import { RouteOptions, IDevServerUser } from "./loader";
import { OdspUrlResolver } from "./odspUrlResolver";

function getUrlResolver(
    documentId: string,
    options: RouteOptions,
): IUrlResolver {
    switch (options.mode) {
        case "docker":
            return new InsecureUrlResolver(
                "http://localhost:3000",
                "http://localhost:3003",
                "http://localhost:3001",
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
                "http://localhost:3000",
                "http://localhost:3000",
                "http://localhost:3000",
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
            return new TestResolver();
    }
}

const getUser = (): IDevServerUser => ({
    id: uuid(),
    name: getRandomName(),
});

export class MultiUrlResolver implements IUrlResolver {
    public readonly isExperimentalUrlResolver = true;
    private readonly urlResolver: IUrlResolver;
    constructor(
        private readonly rawUrl: string,
        private readonly documentId: string,
        private readonly options: RouteOptions) {
        this.urlResolver = getUrlResolver(documentId, options);
    }

    async requestUrl(resolvedUrl: IResolvedUrl, request: IRequest): Promise<IResponse> {
        let url = request.url;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        const response: IResponse = {
            mimeType: "text/plain",
            value: `${this.rawUrl}/${this.documentId}/${url}`,
            status: 200,
        };
        return response;
    }

    async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        return this.urlResolver.resolve(request);
    }

    public createRequestForCreateNew(
        fileName: string,
    ): IRequest {
        switch (this.options.mode) {
            case "r11s":
            case "docker":
            case "tinylicious":
                return (this.urlResolver as InsecureUrlResolver).createCreateNewRequest(fileName);

            case "spo":
            case "spo-df":
                return (this.urlResolver as OdspUrlResolver).createCreateNewRequest(
                    `https://${this.options.server}`,
                    this.options.driveId,
                    "/r11s/",
                    fileName);

            default: // Local
                return (this.urlResolver as TestResolver).createCreateNewRequest(fileName);
        }
    }
}
