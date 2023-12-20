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
	// ISharedDirectory,
} from "@fluidframework/map";
import {
	IChannel,
	IChannelFactory,
	// IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";

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

	describe("Generic test pattern", () => {
		const messages: any[] = [];

		beforeEach(() => {
			messages.length = 0;
		});

		//* Finalize name and add comment
		function createAndDoStuff<T extends IChannel>(
			id: string,
			factory: IFactory<T>,
			doStuff: (dds: T) => void,
		) {
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			const deltaConnection = new MockDeltaConnection(
				/* submitFn: */ (message) => {
					messages.push(message);
					return 0; // unused
				},
				/* dirtyFn: */ () => {},
			);
			const services = {
				deltaConnection,
				objectStorage: new MockStorage(),
			};
			const dds = factory.create(dataStoreRuntime, id);
			dds.connect(services);

			doStuff(dds);
		}

		interface IFactory<T extends IChannel> {
			create: (...args: Parameters<IChannelFactory["create"]>) => T;
		}

		interface ITestCase {
			name: string;
			createAndDoStuff(id: string): void;
			expectHandlesDetected: boolean;
		}

		const testCases: ITestCase[] = [
			{
				name: "SharedDirectory",
				createAndDoStuff: (id: string) => {
					createAndDoStuff(id, new DirectoryFactory(), (dds: IDirectory) => {
						dds.set("whatever", new MockHandle("whatever"));
					});
				},
				expectHandlesDetected: true,
			},
		];

		testCases.forEach((testCase) => {
			it(`should not obscure handles in ${testCase.name} message contents`, async () => {
				testCase.createAndDoStuff(testCase.name);

				assert.equal(messages.length, 1, "Expected a single message to be submitted");
				assert.equal(
					detectHandleViaJsonStingify(messages[0]),
					testCase.expectHandlesDetected,
					`The handle ${
						testCase.expectHandlesDetected ? "should" : "should not"
					} be detected`,
				);
			});
		});
	});

	//* SKIP
	//* SKIP
	//* SKIP
	//* SKIP
	//* SKIP
	//* SKIP
	describe.skip("SharedMap", () => {
		it("should not obscure handles in message contents", async () => {
			const messages: any[] = [];
			const directory = createDirectoryWithSubmitCallback("directory", (message) => {
				messages.push(message);
				return 0; // unused
			});
			const handle = new MockHandle("whatever");
			directory.set("map", handle);

			assert.equal(messages.length, 1, "Expected a single message to be submitted");
			assert(detectHandleViaJsonStingify(messages[0]), "The handle should be detected");
		});
	});
});
