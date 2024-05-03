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
import { DirectoryFactory, IDirectory, MapFactory } from "@fluidframework/map";
import { IChannel, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ConsensusRegisterCollectionFactory } from "@fluidframework/register-collection";
import { detectOutboundReferences } from "@fluidframework/container-runtime";

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
	 * This uses the same logic that the ContainerRuntime does when processing incoming messages
	 * to detect handles in the op's object graph, for notifying GC of new references between objects.
	 *
	 * @returns The list of handles found in the given contents object
	 */
	function findAllHandles(contents: unknown) {
		const envelope = { contents, address: "envelope" };
		const handlesFound: string[] = [];
		detectOutboundReferences(envelope, (from, to) => {
			handlesFound.push(to);
		});
		return handlesFound;
	}

	/** A "Mask" over IChannelFactory that specifies the return type of create */
	interface IChannelFactoryWithCreatedType<T extends IChannel>
		extends Omit<IChannelFactory, "create"> {
		create: (...args: Parameters<IChannelFactory["create"]>) => T;
	}

	/** Each test case runs some code then declares the handles (if any) it expects to be included in the op payload */
	interface ITestCase {
		name: string;
		addHandleToDDS(): void;
		expectedHandles: string[];
	}

	/** This takes care of creating the DDS behind the scenes so the ITestCase's code is ready to invoke */
	function createTestCase<T extends IChannel>(
		factory: IChannelFactoryWithCreatedType<T>,
		addHandleToDDS: (dds: T) => void,
		expectedHandles: string[],
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
			addHandleToDDS: () => addHandleToDDS(dds),
			expectedHandles,
		};
	}

	const testCases: ITestCase[] = [
		createTestCase(
			new MapFactory(),
			(dds: Map<string, any>) => {
				dds.set("whatever", handle);
			},
			[handle.absolutePath] /* expectedHandles */,
		),
		createTestCase(
			new DirectoryFactory(),
			(dds: IDirectory) => {
				dds.set("whatever", handle);
			},
			[handle.absolutePath] /* expectedHandles */,
		),
		createTestCase(
			new ConsensusRegisterCollectionFactory(),
			(dds) => {
				dds.write("whatever", handle).catch(() => {
					// We only care about errors before message submission, which will fail the message.length assert below.
				});
			},
			[] /* expectedHandles */,
		),
	];

	testCases.forEach((testCase) => {
		const shouldOrShouldNot = testCase.expectedHandles.length > 0 ? "should" : "should not";
		it(`${shouldOrShouldNot} obscure handles in ${testCase.name} message contents`, async () => {
			testCase.addHandleToDDS();

			assert.equal(messages.length, 1, "Expected a single message to be submitted");
			assert.deepEqual(
				findAllHandles(messages[0]),
				testCase.expectedHandles,
				`The handle ${shouldOrShouldNot} be detected`,
			);
		});
	});
});
