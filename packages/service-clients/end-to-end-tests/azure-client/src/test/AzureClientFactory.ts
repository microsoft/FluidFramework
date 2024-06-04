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
import {
	AzureClient as AzureClientLegacy,
	AzureLocalConnectionConfig as AzureLocalConnectionConfigLegacy,
	AzureRemoteConnectionConfig as AzureRemoteConnectionConfigLegacy,
	ITelemetryBaseLogger as ITelemetryBaseLoggerLegacy,
} from "@fluidframework/azure-client-legacy";
import { IConfigProviderBase } from "@fluidframework/core-interfaces";
import { MockLogger, createMultiSinkLogger } from "@fluidframework/telemetry-utils/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { default as Axios, AxiosResponse, type AxiosRequestConfig } from "axios";
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

/**
 * Copy of {@link createAzureClient} with legacy (LTS) AzureClient APIs.
 */
export function createAzureClientLegacy(
	userID?: string,
	userName?: string,
	logger?: MockLogger,
): AzureClientLegacy {
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
	const connectionProps: AzureRemoteConnectionConfigLegacy | AzureLocalConnectionConfigLegacy =
		useAzure
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
	const getLogger = (): ITelemetryBaseLoggerLegacy | undefined => {
		const testLogger = getTestLogger?.();
		if (!logger && !testLogger) {
			return undefined;
		}
		if (logger && testLogger) {
			return createMultiSinkLogger({ loggers: [logger, testLogger] });
		}
		return logger ?? testLogger;
	};
	return new AzureClientLegacy({
		connection: connectionProps,
		logger: getLogger(),
	});
}

/**
 * This function is used to create a container using any summary payload.
 * It is primary intended as a workaround to using the AzureClient, and
 * is only being used at the moment for ephemeral container E2E tests
 * since AzureClient does not currently support ephemeral containers.
 *
 * Usage of this function for anything other than ephemeral E2E tests is
 * not recommended.
 *
 * @param requestPayload - The summary payload used to create the container,
 * currently these are mainly fetched from ephemeralSummaryTrees.ts
 * @param userID - ID for the user creating the container
 * @param userName - Name for the user creating the container
 * @returns - An AxiosResponse containing the container ID(response.data.id)
 */
export async function createContainerFromPayload(
	requestPayload: object,
	userID?: string,
	userName?: string,
): Promise<AxiosResponse> {
	const useAzure = process.env.FLUID_CLIENT === "azure";
	const tenantId = useAzure
		? (process.env.azure__fluid__relay__service__tenantId as string)
		: "local";
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
			throw new Error(`Error creating container. Status code: ${response.status}`);
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if (response?.data === undefined || (useAzure && response?.data?.id === undefined)) {
			throw new Error(`ID of the created container is undefined`);
		}

		return response;
	} catch (error) {
		throw new Error(`An error occurred: ${error}`);
	}
}

/**
 * This function takes an AxiosResponse returned by the createContainerFromPayload and returns the containerId.
 * A separate function is used for this, since the data path to the containerID is not always the same.
 * (Tinylicious has the ID stored at a different path than other services)
 *
 * @param response - A container creation response returned by createContainerFromPayload
 * @returns - The ID of the container that was created by createContainerFromPayload
 */
export function getContainerIdFromPayloadResponse(response: AxiosResponse): string {
	const useAzure = process.env.FLUID_CLIENT === "azure";
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	return (useAzure ? response.data.id : response.data) as string;
}
