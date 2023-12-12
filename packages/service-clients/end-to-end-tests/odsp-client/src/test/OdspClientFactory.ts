/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { OdspClient, OdspConnectionConfig } from "@fluid-experimental/odsp-client";

import {
	IConfigProviderBase,
	MockLogger,
	createMultiSinkLogger,
} from "@fluidframework/telemetry-utils";
import { OdspTestTokenProvider } from "./OdspTokenFactory";

/**
 * Interface representing the credentials required for testing odsp-client.
 */
export interface OdspLoginCredentials {
	username: string;
	password: string;
}

export interface OdspCredentials extends OdspLoginCredentials {
	clientId: string;
	clientSecret: string;
}

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link OdspClient} instance based on the mode by setting the Connection config accordingly.
 */
export function createOdspClient(
	creds: OdspLoginCredentials,
	logger?: MockLogger,
	configProvider?: IConfigProviderBase,
): OdspClient {
	const siteUrl = process.env.odsp__client__siteUrl as string;
	const driveId = process.env.odsp__client__driveId as string;
	const clientId = process.env.odsp__client__clientId as string;
	const clientSecret = process.env.odsp__client__clientSecret as string;
	if (siteUrl === undefined) {
		throw new Error("site url is missing");
	}
	if (driveId === undefined) {
		throw new Error("RaaS drive id is missing");
	}

	if (clientId === undefined) {
		throw new Error("client id is missing");
	}

	if (clientSecret === undefined) {
		throw new Error("client secret is missing");
	}

	if (creds.username === undefined || creds.password === undefined) {
		throw new Error("Some of the odsp credentials are undefined");
	}

	const credentials: OdspCredentials = {
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
