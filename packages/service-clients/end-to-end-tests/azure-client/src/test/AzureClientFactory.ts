/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AzureClient,
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
	ITelemetryBaseLogger,
} from "@fluidframework/azure-client";
import { type ScopeType } from "@fluidframework/azure-client/internal";
import { IConfigProviderBase } from "@fluidframework/core-interfaces";
import { MockLogger, createMultiSinkLogger } from "@fluidframework/telemetry-utils/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { v4 as uuid } from "uuid";

import { createAzureTokenProvider } from "./AzureTokenFactory.js";

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link AzureClient} instance based on the mode by setting the Connection config accordingly.
 */
export function createAzureClient(
	id?: string,
	name?: string,
	logger?: MockLogger,
	configProvider?: IConfigProviderBase,
	scopes?: ScopeType[],
): AzureClient {
	const useAzure = process.env.FLUID_CLIENT === "azure";
	const tenantId = useAzure
		? (process.env.azure__fluid__relay__service__tenantId as string)
		: "frs-client-tenant";
	const user = {
		id: id ?? uuid(),
		name: name ?? uuid(),
	};
	const endPoint = process.env.azure__fluid__relay__service__endpoint as string;
	if (useAzure && endPoint === undefined) {
		throw new Error("Azure FRS endpoint is missing");
	}

	// use AzureClient remote mode will run against live Azure Fluid Relay.
	// Default to running Tinylicious for PR validation
	// and local testing so it's not hindered by service availability
	const connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = useAzure
		? {
				tenantId,
				tokenProvider: createAzureTokenProvider(id ?? "foo", name ?? "bar", scopes),
				endpoint: endPoint,
				type: "remote",
		  }
		: {
				tokenProvider: new InsecureTokenProvider("fooBar", user, scopes),
				endpoint: "http://localhost:7071",
				type: "local",
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
	return new AzureClient({
		connection: connectionProps,
		logger: getLogger(),
		configProvider,
	});
}
