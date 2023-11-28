/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import { strict as assert } from "assert";
import { type ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { AttachState } from "@fluidframework/container-definitions";
import { OdspConnectionConfig } from "../interfaces";
import { OdspClient } from "../odspClient";
import { OdspTestTokenProvider } from "./odspTestTokenProvider";

function createOdspClient(): OdspClient {
	const connectionProperties: OdspConnectionConfig = {
		tokenProvider: new OdspTestTokenProvider(),
		siteUrl: process.env.site__url as string,
		driveId: process.env.drive__id as string,
	};

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return new OdspClient({ connection: connectionProperties });
}

describe("OdspClient", () => {
	// const connectTimeoutMs = 1000;
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
