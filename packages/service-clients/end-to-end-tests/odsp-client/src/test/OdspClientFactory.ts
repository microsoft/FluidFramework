/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IConfigProviderBase, type ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { OdspClient, OdspConnectionConfig } from "@fluid-experimental/odsp-client";

import { MockLogger, createMultiSinkLogger } from "@fluidframework/telemetry-utils";
import { OdspTestTokenProvider } from "./OdspTokenFactory";

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
	clientSecret: string;
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
	const clientId = process.env.odsp__client__client__id as string;
	const clientSecret = process.env.odsp__client__client__secret as string;
	if (siteUrl === "" || siteUrl === undefined) {
		throw new Error("site url is missing");
	}
	if (driveId === "" || driveId === undefined) {
		throw new Error("RaaS drive id is missing");
	}

	if (clientId === "" || clientId === undefined) {
		throw new Error("client id is missing");
	}

	if (clientSecret === "" || clientSecret === undefined) {
		throw new Error("client secret is missing");
	}

	if (creds.username === undefined || creds.password === undefined) {
		throw new Error("username or password is missing for login account");
	}

	const credentials: IOdspCredentials = {
		clientId,
		clientSecret,
		...creds,
	};

	const connectionProps: OdspConnectionConfig = {
		siteUrl,
		tokenProvider: new OdspTestTokenProvider(credentials),
		driveId,
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
