/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import { InsecureTokenProvider, InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
import { v4 as uuid } from "uuid";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { RouterliciousDriverApiType, RouterliciousDriverApi } from "./routerliciousDriverApi";

export interface IServiceEndpoint {
    hostUrl: string;
    ordererUrl: string;
    deltaStorageUrl: string;
}

export class RouterliciousTestDriver implements ITestDriver {
    public static createFromEnv(api: RouterliciousDriverApiType = RouterliciousDriverApi) {
        let bearerSecret = process.env.fluid__webpack__bearerSecret;
        let tenantSecret = process.env.fluid__webpack__tenantSecret;
        const tenantId = process.env.fluid__webpack__tenantId ?? "fluid";
        const fluidHost = process.env.fluid__webpack__fluidHost;

        assert(fluidHost, "Missing Fluid host");
        assert(tenantId, "Missing tenantId");

        let serviceEndpoint: IServiceEndpoint;

        if (fluidHost.includes("localhost")) {
            serviceEndpoint = {
                hostUrl: "http://localhost:3000",
                ordererUrl: "http://localhost:3003",
                deltaStorageUrl: "http://localhost:3001",
            };
            bearerSecret = "create-new-tenants-if-going-to-production";
            tenantSecret = "create-new-tenants-if-going-to-production";
        }
        else {
            assert(bearerSecret, "Missing bearer secret");
            assert(tenantSecret, "Missing tenant secret");

            serviceEndpoint = {
                hostUrl: fluidHost,
                ordererUrl: fluidHost.replace("www", "alfred"),
                deltaStorageUrl: fluidHost.replace("www", "historian"),
            };
        }

        return new RouterliciousTestDriver(
            bearerSecret,
            tenantId,
            tenantSecret,
            serviceEndpoint,
            process.env.BUILD_BUILD_ID,
            api,
        );
    }

    public readonly type = "routerlicious";
    public get version() { return this.api.version; }
    private readonly testIdPrefix: string;
    constructor(
        private readonly bearerSecret: string,
        private readonly tenantId: string,
        private readonly tenantSecret: string,
        private readonly serviceEndpoints: IServiceEndpoint,
        testIdPrefix: string | undefined,
        private readonly api: RouterliciousDriverApiType = RouterliciousDriverApi,
    ) {
        this.testIdPrefix = `${testIdPrefix ?? ""}-`;
    }

    public createDocumentId(testId: string) {
        return this.testIdPrefix + testId;
    }

    async createContainerUrl(testId: string): Promise<string> {
        // eslint-disable-next-line max-len
        return `${this.serviceEndpoints.hostUrl}/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.createDocumentId(testId))}`;
    }

    createDocumentServiceFactory(): IDocumentServiceFactory {
        const tokenProvider = new InsecureTokenProvider(
            this.tenantSecret,
            {
                id: uuid(),
            },
        );

        return new this.api.RouterliciousDocumentServiceFactory(
            tokenProvider,
        );
    }

    createUrlResolver(): InsecureUrlResolver {
        return new InsecureUrlResolver(
                this.serviceEndpoints.hostUrl,
                this.serviceEndpoints.ordererUrl,
                this.serviceEndpoints.deltaStorageUrl,
                this.tenantId,
                this.bearerSecret,
                true);
    }

    createCreateNewRequest(testId: string): IRequest {
        return this.createUrlResolver().createCreateNewRequest(this.createDocumentId(testId));
    }
}
