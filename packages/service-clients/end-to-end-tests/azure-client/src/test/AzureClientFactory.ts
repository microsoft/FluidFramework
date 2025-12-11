/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AzureClient,
	type AzureLocalConnectionConfig,
	type AzureRemoteConnectionConfig,
	type ITelemetryBaseLogger,
} from "@fluidframework/azure-client";
// eslint-disable-next-line import-x/no-internal-modules -- TODO consider a test exposure to avoid /internal
import type { AzureClientPropsInternal } from "@fluidframework/azure-client/internal";
import {
	AzureClient as AzureClientLegacy,
	type AzureLocalConnectionConfig as AzureLocalConnectionConfigLegacy,
	type AzureRemoteConnectionConfig as AzureRemoteConnectionConfigLegacy,
	type ITelemetryBaseLogger as ITelemetryBaseLoggerLegacy,
} from "@fluidframework/azure-client-legacy";
import type { IRuntimeFactory } from "@fluidframework/container-definitions/legacy";
import type { IConfigProviderBase } from "@fluidframework/core-interfaces";
import { ScopeType } from "@fluidframework/driver-definitions/legacy";
import type { CompatibilityMode, ContainerSchema } from "@fluidframework/fluid-static";
import {
	type MockLogger,
	createChildLogger,
	createMultiSinkLogger,
} from "@fluidframework/telemetry-utils/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { v4 as uuid } from "uuid";

/**
 * Response type for container creation requests.
 * - Azure Fluid Relay (AFR) returns `{ id: string }` object
 * - Local Tinylicious returns the container ID as a plain string
 */
interface FetchResponse {
	status: number;
	data: { id?: string } | string;
}

import { createAzureTokenProvider } from "./AzureTokenFactory.js";

// eslint-disable-next-line unicorn/prefer-export-from
export { ScopeType };

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
	createContainerRuntimeFactory?: ({
		schema,
		compatibilityMode,
	}: {
		schema: ContainerSchema;
		compatibilityMode: CompatibilityMode;
	}) => IRuntimeFactory,
): AzureClient {
	const args = process.argv.slice(2);

	const driverIndex = args.indexOf("--driver");
	const r11sEndpointNameIndex = args.indexOf("--r11sEndpointName");

	// Get values associated with the flags
	const driver = driverIndex === -1 ? undefined : args[driverIndex + 1];
	const r11sEndpointName =
		r11sEndpointNameIndex === -1 ? undefined : args[r11sEndpointNameIndex + 1];

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
		throw new Error("Azure Fluid Relay service endpoint is missing");
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
				endpoint: "http://localhost:7071", // Port for local Azure Fluid Relay (AFR) service
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

	const createLogger = createChildLogger({
		logger: getLogger(),
		properties: {
			all: {
				driverType: useAzure ? r11sEndpointName : driver,
				driverEndpointName: driver,
			},
		},
	});

	const props: AzureClientPropsInternal = {
		connection: connectionProps,
		logger: createLogger,
		configProvider,
		createContainerRuntimeFactory,
	};
	return new AzureClient(props);
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
		throw new Error("Azure Azure Fluid Relay service endpoint is missing");
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
					endpoint: "http://localhost:7071", // Port for local Azure Fluid Relay (AFR) service
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
 * @returns A FetchResponse containing the container ID(response.data.id)
 */
export async function createContainerFromPayload(
	requestPayload: object,
	userID?: string,
	userName?: string,
): Promise<FetchResponse> {
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
		: "http://localhost:7071"; // Port for local Azure Fluid Relay (AFR) service
	if (useAzure && endPoint === undefined) {
		throw new Error("Azure Fluid Relay service endpoint is missing");
	}

	const tokenProvider = useAzure
		? createAzureTokenProvider(userID ?? "foo", userName ?? "bar")
		: new InsecureTokenProvider("fooBar", user);
	const ordererToken = await tokenProvider.fetchOrdererToken(tenantId, undefined, false);

	const headers = {
		"Authorization": `Basic ${ordererToken.jwt}`,
		"Content-Type": "application/json",
	};

	const url = `${endPoint}/documents/${tenantId}`;

	try {
		const response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(requestPayload),
		});

		// Fetch doesn't auto-throw on non-2xx responses like axios did, so check explicitly
		if (!response.ok) {
			throw new Error(`Error creating container. Status code: ${response.status}`);
		}

		if (response.status === 201) {
			console.log("Container created successfully");
		}

		const data: { id?: string } | string = (await response.json()) as { id?: string } | string;

		if (
			data === undefined ||
			(useAzure && typeof data === "object" && data.id === undefined)
		) {
			throw new Error(`ID of the created container is undefined`);
		}

		return { status: response.status, data };
	} catch (error) {
		throw new Error(`An error occurred: ${error}`);
	}
}

/**
 * This function takes a FetchResponse returned by the createContainerFromPayload and returns the containerId.
 * A separate function is used for this, since the data path to the containerID is not always the same.
 * (Tinylicious has the ID stored at a different path than other services)
 *
 * @param response - A container creation response returned by createContainerFromPayload
 * @returns The ID of the container that was created by createContainerFromPayload
 */
export function getContainerIdFromPayloadResponse(response: FetchResponse): string {
	const useAzure = process.env.FLUID_CLIENT === "azure";
	if (useAzure) {
		if (typeof response.data === "object" && response.data.id !== undefined) {
			return response.data.id;
		}
		throw new Error("Invalid response format for Azure");
	}
	if (typeof response.data === "string") {
		return response.data;
	}
	throw new Error("Invalid response format for local");
}
