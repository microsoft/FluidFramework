/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { InsecureUrlResolver } from "@fluidframework/driver-utils";
import { v4 as uuid } from "uuid";
import { IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import { IRouterliciousDriverPolicies } from "@fluidframework/routerlicious-driver";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { RouterliciousDriverApiType, RouterliciousDriverApi } from "./routerliciousDriverApi";

interface IServiceEndpoint {
    hostUrl: string;
    ordererUrl: string;
    deltaStorageUrl: string;
}

const dockerConfig = (driverPolicies?: IRouterliciousDriverPolicies) => ({
    serviceEndpoint: {
        hostUrl: "http://localhost:3000",
        ordererUrl: "http://localhost:3003",
        deltaStorageUrl: "http://localhost:3001",
    },
    tenantId: "fluid",
    tenantSecret: "create-new-tenants-if-going-to-production",
    driverPolicies,
});

function getConfig(
    fluidHost?: string,
    tenantId?: string,
    tenantSecret?: string,
    driverPolicies?: IRouterliciousDriverPolicies) {
    assert(fluidHost, "Missing Fluid host");
    assert(tenantId, "Missing tenantId");
    assert(tenantSecret, "Missing tenant secret");
    return {
        serviceEndpoint: {
            hostUrl: fluidHost,
            ordererUrl: fluidHost.replace("www", "alfred"),
            deltaStorageUrl: fluidHost.replace("www", "historian"),
        },
        tenantId,
        tenantSecret,
        driverPolicies,
    };
}

function getLegacyConfigFromEnv() {
    const fluidHost = process.env.fluid__webpack__fluidHost;
    const tenantSecret = process.env.fluid__webpack__tenantSecret;
    const tenantId = process.env.fluid__webpack__tenantId ?? "fluid";
    return getConfig(fluidHost, tenantId, tenantSecret);
}

function getEndpointConfigFromEnv(r11sEndpointName: string) {
    const configStr = process.env[`fluid__test__driver__${r11sEndpointName}`];
    if (r11sEndpointName === "docker") {
        const dockerDriverPolicies = configStr === undefined ? configStr : (JSON.parse(configStr)).driverPolicies;
        return dockerConfig(dockerDriverPolicies);
    }
    if (r11sEndpointName === "r11s" && configStr === undefined) {
        // Allow legacy setting from fluid__webpack__ for r11s for now
        return getLegacyConfigFromEnv();
    }
    assert(configStr, `Missing config for ${r11sEndpointName}`);
    const config = JSON.parse(configStr);
    return getConfig(config.host, config.tenantId, config.tenantSecret, config.driverPolicies);
}

function getConfigFromEnv(r11sEndpointName?: string) {
    if (r11sEndpointName === undefined) {
        const fluidHost = process.env.fluid__webpack__fluidHost;
        if (fluidHost === undefined) {
            // default to get it with the per service env for r11s
            return getEndpointConfigFromEnv("r11s");
        }
        return fluidHost.includes("localhost") ? dockerConfig() : getLegacyConfigFromEnv();
    }
    return getEndpointConfigFromEnv(r11sEndpointName);
}

export class RouterliciousTestDriver implements ITestDriver {
    public static createFromEnv(config?: { r11sEndpointName?: string },
        api: RouterliciousDriverApiType = RouterliciousDriverApi,
    ) {
        const { serviceEndpoint, tenantId, tenantSecret, driverPolicies } = getConfigFromEnv(config?.r11sEndpointName);
        return new RouterliciousTestDriver(
            tenantId,
            tenantSecret,
            serviceEndpoint,
            api,
            driverPolicies,
            config?.r11sEndpointName,
        );
    }

    public readonly type = "routerlicious";
    public get version() { return this.api.version; }
    private constructor(
        private readonly tenantId: string,
        private readonly tenantSecret: string,
        private readonly serviceEndpoints: IServiceEndpoint,
        private readonly api: RouterliciousDriverApiType = RouterliciousDriverApi,
        private readonly driverPolicies: IRouterliciousDriverPolicies | undefined,
        public readonly endpointName?: string,
    ) {
    }

    async createContainerUrl(testId: string, containerUrl?: IResolvedUrl): Promise<string> {
        const containerId = containerUrl && "id" in containerUrl ? containerUrl.id : testId;
        // eslint-disable-next-line max-len
        return `${this.serviceEndpoints.hostUrl}/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(containerId)}`;
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
            this.driverPolicies,
        );
    }

    createUrlResolver(): InsecureUrlResolver {
        return new InsecureUrlResolver(
            this.serviceEndpoints.hostUrl,
            this.serviceEndpoints.ordererUrl,
            this.serviceEndpoints.deltaStorageUrl,
            this.tenantId,
            "", // Don't need the bearer secret for NodeTest
            true);
    }

    createCreateNewRequest(testId: string): IRequest {
        return this.createUrlResolver().createCreateNewRequest(testId);
    }
}
