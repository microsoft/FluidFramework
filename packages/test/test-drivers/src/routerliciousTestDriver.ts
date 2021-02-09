/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { InsecureTokenProvider, InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
import { v4 as uuid } from "uuid";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { pkgVersion } from "./packageVersion";

export class RouterliciousTestDriver implements ITestDriver {
    public static createFromEnv() {
        const bearerSecret = process.env.fluid__webpack__bearerSecret;
        const tenantId = process.env.fluid__webpack__tenantId ?? "fluid";
        const tenantSecret = process.env.fluid__webpack__tenantSecret;
        const fluidHost = process.env.fluid__webpack__fluidHost;
        assert(bearerSecret, "Missing bearer secret");
        assert(tenantId, "Missing tenantId");
        assert(tenantSecret, "Missing tenant secret");
        assert(fluidHost, "Missing Fluid host");

        return new RouterliciousTestDriver(
            bearerSecret,
            tenantId,
            tenantSecret,
            fluidHost,
            process.env.BUILD_BUILD_ID,
        );
    }

    public readonly type = "routerlicious";
    public readonly version = pkgVersion;
    private readonly testIdPrefix: string;
    constructor(
        private readonly bearerSecret: string,
        private readonly tenantId: string,
        private readonly tenantSecret: string,
        private readonly fluidHost: string,
        testIdPrefix: string | undefined,
    ) {
        this.testIdPrefix = `${testIdPrefix ?? ""}-`;
    }

    public createDocumentId(testId: string) {
        return this.testIdPrefix + testId;
    }

    createContainerUrl(testId: string): string {
        // eslint-disable-next-line max-len
        return `${this.fluidHost}/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.createDocumentId(testId))}`;
    }

    createDocumentServiceFactory(): RouterliciousDocumentServiceFactory {
        const tokenProvider = new InsecureTokenProvider(
            this.tenantSecret,
            {
                id: uuid(),
            },
        );

        return new RouterliciousDocumentServiceFactory(
            tokenProvider,
            false,
            new DefaultErrorTracking(),
            false,
            true,
            undefined,
        );
    }

    createUrlResolver(): InsecureUrlResolver {
        const dockerUrls = {
            hostUrl: "http://localhost:3000",
            ordererUrl: "http://localhost:3003",
            storageUrl: "http://localhost:3001",
        };

        return this.fluidHost.includes("localhost") ?
            new InsecureUrlResolver(
                dockerUrls.hostUrl,
                dockerUrls.ordererUrl,
                dockerUrls.storageUrl,
                "fluid",
                "create-new-tenants-if-going-to-production") :
            new InsecureUrlResolver(
                    this.fluidHost,
                    this.fluidHost.replace("www", "alfred"),
                    this.fluidHost.replace("www", "historian"),
                    this.tenantId,
                    this.bearerSecret,
                    true);
    }

    createCreateNewRequest(testId: string): IRequest {
        return this.createUrlResolver().createCreateNewRequest(this.createDocumentId(testId));
    }
}