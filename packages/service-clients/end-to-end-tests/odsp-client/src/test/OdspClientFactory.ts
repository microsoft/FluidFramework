/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConfigProviderBase, type ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { OdspClient, OdspConnectionConfig } from "@fluidframework/odsp-client";
import { MockLogger, createMultiSinkLogger } from "@fluidframework/telemetry-utils/internal";

import { OdspTestTokenProvider } from "./OdspTokenFactory.js";

interface LoginTenantRange {
	prefix: string;
	start: number;
	count: number;
	password: string;
}

export interface LoginTenants {
	[tenant: string]: {
		range: LoginTenantRange;
	};
}

/**
 * Interface representing the odsp-client login account credentials.
 */
export interface IOdspLoginCredentials {
	username: string;
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
export const getCredentials = (): IOdspLoginCredentials[] => {
	const creds: IOdspLoginCredentials[] = [];
	const loginTenants = process.env.login__odspclient__spe__test__tenants as string;

	console.log(typeof loginTenants);

	if (loginTenants !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const tenants: LoginTenants = JSON.parse(loginTenants);
		const tenantNames = Object.keys(tenants);
		const tenant = tenantNames[0];
		if (tenant === undefined) {
			throw new Error("Tenant is undefined");
		}
		const tenantInfo = tenants[tenant];

		if (tenantInfo === undefined) {
			throw new Error("Tenant info is undefined");
		}

		const range = tenantInfo.range;

		if (range) {
			for (let i = 0; i < range.count; i++) {
				creds.push({
					username: `${range.prefix}${range.start + i}@${tenant}`,
					password: range.password,
				});
			}
		}
	}

	return creds;
};

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link OdspClient} instance based on the mode by setting the Connection config accordingly.
 */
export function createOdspClient(
	creds: IOdspLoginCredentials,
	logger?: MockLogger,
	configProvider?: IConfigProviderBase,
): OdspClient {
	const siteUrl = process.env.odsp__client__siteUrl__test as string;
	const driveId = process.env.odsp__client__driveId__test as string;
	const clientId = process.env.odsp__client__clientId__test as string;
	if (siteUrl === "" || siteUrl === undefined) {
		throw new Error("site url is missing");
	}
	if (driveId === "" || driveId === undefined) {
		throw new Error("SharePoint Embedded container id is missing");
	}

	if (clientId === "" || clientId === undefined) {
		throw new Error("client id is missing");
	}

	if (creds.username === undefined || creds.password === undefined) {
		throw new Error("username or password is missing for login account");
	}

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
	return new OdspClient({
		connection: connectionProps,
		logger: getLogger(),
		configProvider,
	});
}
