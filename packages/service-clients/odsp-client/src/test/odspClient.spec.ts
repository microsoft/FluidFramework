/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import { IConfigProviderBase } from "@fluidframework/core-interfaces";
import { type ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
// import { ConnectionState } from "@fluidframework/container-loader";
// import { timeoutPromise } from "@fluidframework/test-utils";
import type { MonitoringContext } from "@fluidframework/telemetry-utils/internal";

import { OdspConnectionConfig } from "../interfaces.js";
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
		driveId: "<raas_drive_id>",
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

	it("GC is disabled by default, but can be enabled", async () => {
		const { container: container_defaultConfig } = await client.createContainer(schema);
		assert.strictEqual(
			(
				container_defaultConfig as unknown as { container: { mc: MonitoringContext } }
			).container.mc.config.getBoolean("Fluid.GarbageCollection.RunSweep"),
			false,
			"Expected GC to be disabled per configs set in constructor",
		);

		const client_gcEnabled = createOdspClient({
			configProvider: {
				getRawConfig: (name: string) =>
					({ "Fluid.GarbageCollection.RunSweep": true })[name],
			},
		});
		const { container: container_gcEnabled } = await client_gcEnabled.createContainer(schema);
		assert.strictEqual(
			(
				container_gcEnabled as unknown as { container: { mc: MonitoringContext } }
			).container.mc.config.getBoolean("Fluid.GarbageCollection.RunSweep"),
			true,
			"Expected GC to be able to enable GC via config provider",
		);
	});
});
