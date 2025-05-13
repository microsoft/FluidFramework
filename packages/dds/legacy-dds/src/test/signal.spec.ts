/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { strict as assert } from "node:assert";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockHandle,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

// eslint-disable-next-line import/no-internal-modules
import { SharedSignal } from "../signal/sharedSignal.js";

describe("SharedSignal", () => {
	let factory: IChannelFactory;
	let dataStoreRuntime: MockFluidDataStoreRuntime;

	const mockHandle = new MockHandle({});
	let remoteSharedSignal: SharedSignal<IFluidHandle>;
	let localSharedSignal: SharedSignal<IFluidHandle>;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

	beforeEach(() => {
		dataStoreRuntime = new MockFluidDataStoreRuntime();
		dataStoreRuntime.local = false;
		factory = SharedSignal.getFactory();

		containerRuntimeFactory = new MockContainerRuntimeFactory();
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
		const services1 = {
			deltaConnection: containerRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		localSharedSignal = factory.create(
			dataStoreRuntime,
			"SharedSignalIFluidHandle",
		) as SharedSignal<IFluidHandle>;
		localSharedSignal.connect(services1);

		const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime2 =
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const services2 = {
			deltaConnection: containerRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		remoteSharedSignal = factory.create(
			dataStoreRuntime2,
			"remoteSharedSignalId",
		) as SharedSignal<IFluidHandle>;
		remoteSharedSignal.connect(services2);
	});

	describe("notify", () => {
		it("should notify both local and remote listeners with the IFluidHandle", () => {
			const localCalls: any[] = [];
			const remoteCalls: any[] = [];

			remoteSharedSignal.on("notify", (m) => localCalls.push(m));
			localSharedSignal.on("notify", (m) => remoteCalls.push(m));

			localSharedSignal.notify(mockHandle);
			containerRuntimeFactory.processAllMessages();

			assert.ok(localCalls[0]);
			assert.ok(remoteCalls[0]);

			assert.equal(localCalls[0].absolutePath, mockHandle.absolutePath);
			assert.equal(remoteCalls[0].absolutePath, mockHandle.absolutePath);
		});
	});
});
