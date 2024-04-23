/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as Axios, AxiosResponse, type AxiosRequestConfig } from "axios";
import { v4 as uuid } from "uuid";
import {
	AzureClient,
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
	ITelemetryBaseLogger,
} from "@fluidframework/azure-client";
import { IConfigProviderBase } from "@fluidframework/core-interfaces";
import { MockLogger, createMultiSinkLogger } from "@fluidframework/telemetry-utils/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";

import { createAzureTokenProvider } from "./AzureTokenFactory.js";

/**
 * This function will determine if local or remote mode is required (based on FLUID_CLIENT), and return a new
 * {@link AzureClient} instance based on the mode by setting the Connection config accordingly.
 */
export function createAzureClient(
	userID?: string,
	userName?: string,
	logger?: MockLogger,
	configProvider?: IConfigProviderBase,
): AzureClient {
	const useAzure = process.env.FLUID_CLIENT === "azure";
	const tenantId = useAzure
		? (process.env.azure__fluid__relay__service__tenantId as string)
		: "frs-client-tenant";
	const user = {
		id: userID ?? uuid(),
		name: userName ?? uuid(),
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
				tokenProvider: createAzureTokenProvider(userID ?? "foo", userName ?? "bar"),
				endpoint: endPoint,
				type: "remote",
		  }
		: {
				tokenProvider: new InsecureTokenProvider("fooBar", user),
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

export async function createContainerFromPayload(
	requestPayload: object,
	userID?: string,
	userName?: string,
): Promise<AxiosResponse | undefined> {
	const useAzure = process.env.FLUID_CLIENT === "azure";
	const tenantId = useAzure
		? (process.env.azure__fluid__relay__service__tenantId as string)
		: "frs-client-tenant";
	const user = {
		id: userID ?? uuid(),
		name: userName ?? uuid(),
	};
	const endPoint = useAzure
		? (process.env.azure__fluid__relay__service__endpoint as string)
		: "http://localhost:7071";
	if (useAzure && endPoint === undefined) {
		throw new Error("Azure FRS endpoint is missing");
	}

	const tokenProvider = useAzure
		? createAzureTokenProvider(userID ?? "foo", userName ?? "bar")
		: new InsecureTokenProvider("fooBar", user);
	const ordererToken = await tokenProvider.fetchOrdererToken(tenantId, undefined, false);

	const headers = {
		"Authorization": `Basic ${ordererToken.jwt}`,
		"Content-Type": "application/json",
	};

	const url = `/documents/${tenantId}`;

	const options: AxiosRequestConfig = {
		baseURL: endPoint,
		data: requestPayload,
		headers,
		maxBodyLength: 1048576000,
		maxContentLength: 1048576000,
		method: "POST",
		url,
	};

	try {
		const response: AxiosResponse = await Axios(options);

		if (response.status === 201) {
			console.log("Container created successfully");
		} else {
			console.error(`Error creating container. Status code: ${response.status}`);
		}
		return response;
	} catch (error) {
		console.error("An error occurred:", error);
	}
	return undefined;
}
