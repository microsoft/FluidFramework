/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
	type MockContainerRuntime,
} from "@fluidframework/test-runtime-utils/internal";

// eslint-disable-next-line import/no-internal-modules
import type { ISharedSignal } from "../../signal/interfaces.js";
// eslint-disable-next-line import/no-internal-modules
import { SharedSignalFactory } from "../../signal/sharedSignalFactory.js";

interface RollbackTestSetup {
	sharedSignal: ISharedSignal<number>;
	containerRuntime: MockContainerRuntime;
}
const signalFactory = new SharedSignalFactory();

function setupRollbackTest(): RollbackTestSetup {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 }); // TurnBased
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedSignal = signalFactory.create(dataStoreRuntime, "shared-signal-1");
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedSignal.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return {
		sharedSignal,
		containerRuntime,
	};
}

describe("SharedSignal rollback", () => {
	it("rollback should not throw", () => {
		const { sharedSignal, containerRuntime } = setupRollbackTest();
		sharedSignal.notify(0);
		containerRuntime.rollback?.();
	});
});
