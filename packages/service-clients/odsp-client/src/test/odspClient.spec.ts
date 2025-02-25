/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { IConfigProviderBase } from "@fluidframework/core-interfaces";
import type { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";

import type { OdspConnectionConfig } from "../interfaces.js";
import { OdspClient } from "../odspClient.js";

import { OdspTestTokenProvider } from "./odspTestTokenProvider.js";

/**
 * Interface representing the credentials required for testing odsp-client.
 */
export interface OdspTestCredentials {
	clientId: string;
	username: string;
	password: string;
}

/**
 * Default test credentials for odsp-client.
 */
const clientCreds: OdspTestCredentials = {
	clientId: "<client_id>",
	username: "<email_id>",
	password: "<password>",
};

/**
 * Creates an instance of the odsp-client with the specified test credentials.
 *
 * @returns OdspClient - An instance of the odsp-client.
 */
function createOdspClient(props: { configProvider?: IConfigProviderBase } = {}): OdspClient {
	// Configuration for connecting to the ODSP service.
	const connectionProperties: OdspConnectionConfig = {
		tokenProvider: new OdspTestTokenProvider(clientCreds), // Token provider using the provided test credentials.
		siteUrl: "<site_url>",
		driveId: "<sharepoint_embedded_container_id>",
		filePath: "<file_path>",
	};

	return new OdspClient({
		connection: connectionProperties,
		configProvider: props.configProvider,
	});
}

describe("OdspClient", () => {
	// const connectTimeoutMs = 5000;
	let client: OdspClient;
	let schema: ContainerSchema;

	beforeEach(() => {
		client = createOdspClient();
		schema = {
			initialObjects: {
				map: SharedMap,
			},
		};
	});

	/**
	 * Scenario: test when ODSP Client is instantiated correctly, it can create
	 * a container successfully.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can create new ODSP container successfully", async () => {
		const resourcesP = client.createContainer(schema);

		await assert.doesNotReject(resourcesP, () => true, "container cannot be created in ODSP");
	});

	/**
	 * Scenario: test when an ODSP Client container is created,
	 * it is initially detached.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("created container is detached", async () => {
		const { container } = await client.createContainer(schema);
		assert.strictEqual(
			container.attachState,
			AttachState.Detached,
			"Container should be detached",
		);
	});

	it("GC is disabled by default", async () => {
		const { container: container_defaultConfig } = await client.createContainer(schema);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { sweepEnabled, throwOnTombstoneLoad } =
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			(container_defaultConfig as any).container._runtime.garbageCollector.configs;

		const expectedConfigs = {
			sweepEnabled: false,
			throwOnTombstoneLoad: false,
		};
		assert.deepStrictEqual(
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			{ sweepEnabled, throwOnTombstoneLoad },
			expectedConfigs,
			"Expected GC to be disabled per compatibilityModeRuntimeOptions",
		);
	});
});
