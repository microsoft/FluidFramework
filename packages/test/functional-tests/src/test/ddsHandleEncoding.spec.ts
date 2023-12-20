/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// import { UsageError } from "@fluidframework/telemetry-utils";
// import { ISummaryBlob, SummaryType } from "@fluidframework/protocol-definitions";
// import { IGCTestProvider, runGCTests } from "@fluid-private/test-dds-utils";
import {
	MockFluidDataStoreRuntime,
	// MockContainerRuntimeFactory,
	// MockSharedObjectServices,
	MockStorage,
	MockDeltaConnection,
	MockHandle,
} from "@fluidframework/test-runtime-utils";
import {
	SharedDirectory,
	// MapFactory,
	DirectoryFactory,
	IDirectory,
	// IDirectory,
	// ISharedMap,
} from "@fluidframework/map";

/**
 * The purpose of these tests is to demonstrate that DDSes do not do opaque encoding of handles
 * when preparing the op payload (e.g. prematurely serializing).
 * This is important because the runtime needs to inspect the full op payload for handles.
 */
describe("DDS Handle Encoding", () => {
	/**
	 * The purpose of the tests using this helper is to ensure that the message contents submitted
	 * by the DDS contains handles that are detectable via JSON.stringify replacers, since this
	 * is the technique used in the ContainerRuntime to detect handles in incoming ops.
	 * @returns true if the contents object contains at least one encoded handle anywhere
	 */
	function detectHandleViaJsonStingify(contents: unknown) {
		try {
			// use JSON.stringify as a hack to traverse the object structure
			JSON.stringify(contents, (key, value) => {
				if (key === "type" && value === "__fluid_handle__") {
					// Found a handle. We can abort object traversal
					throw new Error("Found a handle");
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return value;
			});
			return false;
		} catch (e: any) {
			if (e.message === "Found a handle") {
				return true;
			}
			// Re-throw unexpected errors
			throw e;
		}
	}

	/**
	 * Create a Directory that connects to mock services that use the given
	 * onSubmit callback.
	 */
	function createDirectoryWithSubmitCallback(
		id: string,
		onSubmit: (messageContent: any) => number,
	): IDirectory {
		const dataStoreRuntime = new MockFluidDataStoreRuntime();
		const deltaConnection = new MockDeltaConnection(onSubmit, () => {});
		const services = {
			deltaConnection,
			objectStorage: new MockStorage(),
		};
		const directory = new SharedDirectory(id, dataStoreRuntime, DirectoryFactory.Attributes);
		directory.connect(services);
		return directory;
	}

	describe("SharedMap", () => {
		it("should not obscure handles in message contents", async () => {
			const messages: any[] = [];
			const directory: IDirectory = createDirectoryWithSubmitCallback(
				"directory",
				(message) => {
					messages.push(message);
					return 0; // unused
				},
			);
			const handle = new MockHandle("whatever");
			directory.set("map", handle);

			assert.equal(messages.length, 1, "Expected a single message to be submitted");
			assert(detectHandleViaJsonStingify(messages[0]), "The handle should be detected");
		});
	});
});
