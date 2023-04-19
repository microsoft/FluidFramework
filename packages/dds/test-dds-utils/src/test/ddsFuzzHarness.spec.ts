/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";

describe("DDS Fuzz Harness", () => {
	// TODO:AB#4095: Add tests which validate the harness behaves as expected, i.e. generates and properly handles
	// cross-cutting DDS features like reconnection, client joins, client op selection, etc.

	// This harness relies on some specific behavior of the shared mocks: putting acceptance tests here
	// for that behavior makes them brittle.
	describe("Fluid mocks", () => {
		it("update the quorum when a new client joins", () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
			const addedClientIds: string[] = [];
			containerRuntimeFactory.quorum.on("addMember", (clientId: string) => {
				addedClientIds.push(clientId);
			});

			assert.deepEqual(addedClientIds, []);
			containerRuntimeFactory.createContainerRuntime(
				new MockFluidDataStoreRuntime({ clientId: "new client" }),
			);
			assert.deepEqual(addedClientIds, ["new client"]);
		});
	});
});
