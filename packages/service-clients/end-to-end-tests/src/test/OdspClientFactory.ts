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

	/**
	 * Default test credentials for odsp-client.
	 */
	const clientCreds: OdspTestCredentials = {
		clientId: "<client_id>",
		clientSecret: "<client_secret>",
		username: "<email_id>",
		password: "<password>",
	};

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
