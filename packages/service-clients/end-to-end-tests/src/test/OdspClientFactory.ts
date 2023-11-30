/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type ITelemetryBaseLogger } from "@fluidframework/common-definitions";
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
export interface OdspTestCredentials {
	clientId: string;
	clientSecret: string;
	username: string;
	password: string;
}

/**
 * Default test credentials for odsp-client.
 */
export const clientCreds: OdspTestCredentials = {
	clientId: "process.env.client__id",
	clientSecret: "process.env.client__secret",
	username: "process.env.odsp__login__username",
	password: "process.env.odsp__login__password",
};

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link OdspClient} instance based on the mode by setting the Connection config accordingly.
 */
export function createOdspClient(
	logger?: MockLogger,
	configProvider?: IConfigProviderBase,
): OdspClient {
	const siteUrl = process.env.odsp__siteUrl as string;

	const driveId = process.env.odsp__driveId as string;

	if (siteUrl === undefined) {
		throw new Error("site url is missing");
	}
	if (driveId === undefined) {
		throw new Error("RaaS drive id is missing");
	}

	if (
		clientCreds.clientId === undefined ||
		clientCreds.clientSecret === undefined ||
		clientCreds.username === undefined ||
		clientCreds.password === undefined
	) {
		throw new Error("Some of the odsp crednetials are undefined");
	}

	const connectionProps: OdspConnectionConfig = {
		siteUrl,
		tokenProvider: new OdspTestTokenProvider(clientCreds),
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
