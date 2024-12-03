/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IConfigProviderBase,
	type ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { OdspClient, OdspConnectionConfig } from "@fluidframework/odsp-client/internal";
import {
	MockLogger,
	createChildLogger,
	createMultiSinkLogger,
} from "@fluidframework/telemetry-utils/internal";

import { OdspTestTokenProvider } from "./OdspTokenFactory.js";

/**
 * Interface representing the range of login credentials for a tenant.
 */
interface LoginTenantRange {
	prefix: string;
	start: number;
	count: number;
	password: string;
}

/**
 * Interface representing a collection of tenants with their respective login ranges.
 * @example
 * ```string
 * {"tenantName":{"range":{"prefix":"prefixName","password":"XYZ","start":0,"count":2}}}
 * ```
 */
export interface LoginTenants {
	[tenant: string]: {
		range: LoginTenantRange;
	};
}

/**
 * Interface representing the odsp-client login account credentials.
 */
export interface IOdspLoginCredentials {
	email: string;
	password: string;
}

/**
 * Interface representing extended credentials for odsp-client, including AAD information.
 * Extends the basic login credentials with client ID and client secret.
 */
export interface IOdspCredentials extends IOdspLoginCredentials {
	clientId: string;
}

/**
 * Get set of credential to use from env variable.
 */
export function getCredentials(): IOdspLoginCredentials[] {
	const creds: IOdspLoginCredentials[] = [];
	const loginTenants = process.env.login__odspclient__spe__test__tenants as string;

	if (loginTenants === "" || loginTenants === undefined) {
		throw new Error("Login tenant is missing");
	}
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const tenants: LoginTenants = JSON.parse(loginTenants);
	const tenantKey = Object.keys(tenants);
	const tenantName = tenantKey[0];
	if (tenantName === undefined) {
		throw new Error("Tenant is undefined");
	}
	const tenantInfo = tenants[tenantName];

	if (tenantInfo === undefined) {
		throw new Error("Tenant info is undefined");
	}

	const range = tenantInfo.range;

	if (range === undefined) {
		throw new Error("range is undefined");
	}

	for (let i = 0; i < range.count; i++) {
		creds.push({
			email: `${range.prefix}${range.start + i}@${tenantName}`,
			password: range.password,
		});
	}

	const [client1Creds, client2Creds] = creds;

	if (client1Creds === undefined || client2Creds === undefined || creds.length < 2) {
		throw new Error("Insufficient number of login credentials");
	}

	if (
		client1Creds.email === undefined ||
		client1Creds.password === undefined ||
		client2Creds.email === undefined ||
		client2Creds.password === undefined
	) {
		throw new Error("Email or password is missing for login account");
	}

	return creds;
}

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link OdspClient} instance based on the mode by setting the Connection config accordingly.
 */
export function createOdspClient(
	creds: IOdspLoginCredentials,
	logger?: MockLogger,
	configProvider?: IConfigProviderBase,
): OdspClient {
	const siteUrl = process.env.odsp__client__siteUrl as string;
	const driveId = process.env.odsp__client__driveId as string;
	const clientId = process.env.odsp__client__clientId as string;
	if (siteUrl === "" || siteUrl === undefined) {
		throw new Error("site url is missing");
	}
	if (driveId === "" || driveId === undefined) {
		throw new Error("SharePoint Embedded container id is missing");
	}

	if (clientId === "" || clientId === undefined) {
		throw new Error("client id is missing");
	}

	const args = process.argv.slice(2);

	const driverIndex = args.indexOf("--driver");
	const odspEndpointNameIndex = args.indexOf("--odspEndpointName");

	// Get values associated with the flags
	const driverType = driverIndex === -1 ? undefined : args[driverIndex + 1];
	const driverEndpointName =
		odspEndpointNameIndex === -1 ? undefined : args[odspEndpointNameIndex + 1];

	const credentials: IOdspCredentials = {
		clientId,
		...creds,
	};

	const connectionProps: OdspConnectionConfig = {
		siteUrl,
		tokenProvider: new OdspTestTokenProvider(credentials),
		driveId,
		filePath: "",
	};

	const getLogger = (): ITelemetryBaseLogger | undefined => {
		const testLogger = getTestLogger?.();
		if (!logger && !testLogger) {
			return undefined;
		}
		if (logger && testLogger) {
			return createMultiSinkLogger({ loggers: [logger, testLogger] });
		}
		return logger ?? testLogger;
	};

	const createLogger = createChildLogger({
		logger: getLogger(),
		properties: {
			all: {
				driverType,
				driverEndpointName,
			},
		},
	});

	return new OdspClient({
		connection: connectionProps,
		logger: createLogger,
		configProvider,
	});
}
