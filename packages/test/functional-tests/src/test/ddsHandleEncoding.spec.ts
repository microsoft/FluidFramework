/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
	MockDeltaConnection,
	MockHandle,
} from "@fluidframework/test-runtime-utils";
import { DirectoryFactory, IDirectory } from "@fluidframework/map";
import { IChannel, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ConsensusRegisterCollectionFactory } from "@fluidframework/register-collection";

/**
 * The purpose of these tests is to demonstrate that DDSes do not do opaque encoding of handles
 * when preparing the op payload (e.g. prematurely serializing).
 * This is important because the runtime needs to inspect the full op payload for handles.
 */
describe("DDS Handle Encoding", () => {
	const handle = new MockHandle("whatever");
	const messages: any[] = [];

	beforeEach(() => {
		messages.length = 0;
	});

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

	/** A "Mask" over IChannelFactory that specifies the return type of create */
	interface IChannelFactoryWithCreatedType<T extends IChannel>
		extends Omit<IChannelFactory, "create"> {
		create: (...args: Parameters<IChannelFactory["create"]>) => T;
	}

	/** Each test case runs some code then declares whether it expects a detectable handle to be included in the op payload */
	interface ITestCase {
		name: string;
		doStuff(): void;
		expectHandlesDetected: boolean;
	}

	/** This takes care of creating the DDS behind the scenes so the testCase's code is ready to invoke */
	function createTestCase<T extends IChannel>(
		factory: IChannelFactoryWithCreatedType<T>,
		doStuff: (dds: T) => void,
		expectHandlesDetected: boolean,
	): ITestCase {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const name = factory.type.split("/").pop()!;

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
		const dds = factory.create(dataStoreRuntime, name);
		dds.connect(services);

		return {
			name,
			doStuff: () => doStuff(dds),
			expectHandlesDetected,
		};
	}

	const testCases: ITestCase[] = [
		createTestCase(
			new DirectoryFactory(),
			(dds: IDirectory) => {
				dds.set("whatever", handle);
			},
			true /* expectHandlesDetected */,
		),
		createTestCase(
			new ConsensusRegisterCollectionFactory(),
			(dds) => {
				dds.write("whatever", handle).catch(() => {
					assert.fail("crc.write rejected!");
				});
			},
			false /* expectHandlesDetected */,
		),
	];

	testCases.forEach((testCase) => {
		const shouldOrShouldNot = testCase.expectHandlesDetected ? "should" : "should not";
		it(`${shouldOrShouldNot} obscure handles in ${testCase.name} message contents`, async () => {
			testCase.doStuff();

			assert.equal(messages.length, 1, "Expected a single message to be submitted");
			assert.equal(
				detectHandleViaJsonStingify(messages[0]),
				testCase.expectHandlesDetected,
				`The handle ${shouldOrShouldNot} be detected`,
			);
		});
	});
});
