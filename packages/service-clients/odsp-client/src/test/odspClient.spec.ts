/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { type ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { AttachState } from "@fluidframework/container-definitions";
// import { ConnectionState } from "@fluidframework/container-loader";
// import { timeoutPromise } from "@fluidframework/test-utils";
import { OdspConnectionConfig } from "../interfaces.js";
import { OdspClient } from "../odspClient.js";
import { OdspTestTokenProvider } from "./odspTestTokenProvider.js";

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
const clientCreds: OdspTestCredentials = {
	clientId: "<client_id>",
	clientSecret: "<client_secret>",
	username: "<email_id>",
	password: "<password>",
};

/**
 * Creates an instance of the odsp-client with the specified test credentials.
 *
 * @returns OdspClient - An instance of the odsp-client.
 */
function createOdspClient(): OdspClient {
	// Configuration for connecting to the ODSP service.
	const connectionProperties: OdspConnectionConfig = {
		tokenProvider: new OdspTestTokenProvider(clientCreds), // Token provider using the provided test credentials.
		siteUrl: "<site_url>",
		driveId: "<raas_drive_id>",
		filePath: "<file_path>",
	};

	return new OdspClient({ connection: connectionProperties });
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
});
