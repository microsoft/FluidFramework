/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { ITestDriver, RouterliciousEndpoint } from "@fluid-internal/test-driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { InsecureUrlResolver } from "@fluidframework/driver-utils/internal";
import { IRouterliciousDriverPolicies } from "@fluidframework/routerlicious-driver/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { v4 as uuid } from "uuid";

import {
	RouterliciousDriverApi,
	RouterliciousDriverApiType,
} from "./routerliciousDriverApi.js";

interface IServiceEndpoint {
	deltaStreamUrl: string;
	hostUrl: string;
	ordererUrl: string;
	deltaStorageUrl: string;
}

const dockerConfig = (driverPolicies?: IRouterliciousDriverPolicies) => ({
	serviceEndpoint: {
		deltaStreamUrl: "http://localhost:3002",
		hostUrl: "http://localhost:3000",
		ordererUrl: "http://localhost:3003",
		deltaStorageUrl: "http://localhost:3001",
	},
	tenantId: "fluid",
	tenantSecret: "create-new-tenants-if-going-to-production",
	driverPolicies,
});

function getConfig(
	discoveryEndpoint?: string,
	fluidHost?: string,
	tenantId?: string,
	tenantSecret?: string,
	driverPolicies?: IRouterliciousDriverPolicies,
) {
	assert(tenantId, "Missing tenantId");
	assert(tenantSecret, "Missing tenant secret");
	if (discoveryEndpoint !== undefined) {
		// The hostUrl, deltaStreamUrl and deltaStorageUrl will be replaced by the URLs of the discovery result.
		// The deltaStorageUrl is firstly set to https://dummy-historian to make the workflow successful.
		return {
			serviceEndpoint: {
				hostUrl: "",
				ordererUrl: discoveryEndpoint,
				deltaStorageUrl: "https://dummy-historian",
				deltaStreamUrl: "",
			},
			tenantId,
			tenantSecret,
			driverPolicies,
		};
	}
	assert(fluidHost, "Missing Fluid host");
	return {
		serviceEndpoint: {
			hostUrl: fluidHost,
			ordererUrl: fluidHost.replace("www", "alfred"),
			deltaStorageUrl: fluidHost.replace("www", "historian"),
			deltaStreamUrl: fluidHost.replace("www", "nexus"),
		},
		tenantId,
		tenantSecret,
		driverPolicies,
	};
}

function getLegacyConfigFromEnv() {
	const discoveryEndpoint = process.env.fluid__webpack__discoveryEndpoint;
	const fluidHost = process.env.fluid__webpack__fluidHost;
	const tenantSecret = process.env.fluid__webpack__tenantSecret;
	const tenantId = process.env.fluid__webpack__tenantId ?? "fluid";
	return getConfig(discoveryEndpoint, fluidHost, tenantId, tenantSecret);
}

function getEndpointConfigFromEnv(r11sEndpointName: RouterliciousEndpoint) {
	const configStr = process.env[`fluid__test__driver__${r11sEndpointName}`];
	if (r11sEndpointName === "docker") {
		const dockerDriverPolicies =
			configStr === undefined ? configStr : JSON.parse(configStr).driverPolicies;
		return dockerConfig(dockerDriverPolicies);
	}
	if (r11sEndpointName === "r11s" && configStr === undefined) {
		// Allow legacy setting from fluid__webpack__ for r11s for now
		return getLegacyConfigFromEnv();
	}
	assert(configStr, `Missing config for ${r11sEndpointName}`);
	const config = JSON.parse(configStr);
	return getConfig(
		config.discoveryEndpoint,
		config.host,
		config.tenantId,
		config.tenantSecret,
		config.driverPolicies,
	);
}

function getConfigFromEnv(r11sEndpointName?: RouterliciousEndpoint) {
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
/**
 * @internal
 */
export function assertRouterliciousEndpoint(
	endpoint: string | undefined,
): asserts endpoint is RouterliciousEndpoint | undefined {
	if (
		endpoint === undefined ||
		endpoint === "frs" ||
		endpoint === "frsCanary" ||
		endpoint === "r11s" ||
		endpoint === "docker"
	) {
		return;
	}
	throw new TypeError("Not a routerlicious endpoint");
}

/**
 * @internal
 */
export class RouterliciousTestDriver implements ITestDriver {
	public static createFromEnv(
		config?: { r11sEndpointName?: string },
		api: RouterliciousDriverApiType = RouterliciousDriverApi,
	) {
		assertRouterliciousEndpoint(config?.r11sEndpointName);
		const { serviceEndpoint, tenantId, tenantSecret, driverPolicies } = getConfigFromEnv(
			config?.r11sEndpointName,
		);
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
	public get version() {
		return this.api.version;
	}
	private constructor(
		private readonly tenantId: string,
		private readonly tenantSecret: string,
		private readonly serviceEndpoints: IServiceEndpoint,
		private readonly api: RouterliciousDriverApiType = RouterliciousDriverApi,
		private readonly driverPolicies: IRouterliciousDriverPolicies | undefined,
		public readonly endpointName?: string,
	) {}

	async createContainerUrl(testId: string, containerUrl?: IResolvedUrl): Promise<string> {
		const containerId = containerUrl && "id" in containerUrl ? containerUrl.id : testId;
		return `${this.serviceEndpoints.hostUrl}/${encodeURIComponent(
			this.tenantId,
		)}/${encodeURIComponent(containerId)}`;
	}

	createDocumentServiceFactory(): IDocumentServiceFactory {
		const tokenProvider = new InsecureTokenProvider(this.tenantSecret, {
			id: uuid(),
			name: uuid(),
		});

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
			this.serviceEndpoints.deltaStreamUrl,
			this.tenantId,
			"", // Don't need the bearer secret for NodeTest
			true,
		);
	}

	createCreateNewRequest(testId: string): IRequest {
		return this.createUrlResolver().createCreateNewRequest(testId);
	}
}
