/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MergeTreeDeltaType } from "@fluidframework/merge-tree";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedString } from "../sharedString";

describe("SharedString op-reentrancy", () => {
	let sharedString: SharedString;
	let sharedString2: SharedString;
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	beforeEach(() => {
		containerRuntimeFactory = new MockContainerRuntimeFactory();

		const factory = SharedString.getFactory();
		const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
		dataStoreRuntime1.local = false;

		sharedString = factory.create(dataStoreRuntime1, "A");

		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: containerRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		sharedString.connect(services1);

		const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
		dataStoreRuntime2.local = false;
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const services2 = {
			deltaConnection: containerRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		sharedString2 = factory.create(dataStoreRuntime2, "B");
		sharedString2.connect(services2);
	});

	/**
	 * This is an example scenario where reentrancy of submission of local ops is problematic which we saw in production.
	 *
	 * Reentrant local ops are a problem at the time of writing this test as most SharedString local application methods
	 * are set up along the lines of:
	 * ```ts
	 * const op = this.client.insert(start, content);
	 * this.submitLocalMessage(op);
	 * ```
	 *
	 * However, `this.client.insert` triggers SharedString's delta event. Thus, if the application uses that event to submit
	 * further ops, from merge-tree's perspective they will have occurred *after* the first op, but the call to submit the op
	 * to the container runtime happens *before* the call to submit the outermost op.
	 *
	 * Symptoms may include various merge-tree asserts that the pending segments queue is inconsistent on the client which
	 * triggered a reentrant op (ex: 0x046) and doc corruption from the perspective of other clients.
	 */
	it("throws on local re-entrancy", () => {
		sharedString.insertText(0, "abcX");
		containerRuntimeFactory.processAllMessages();

		sharedString.on("sequenceDelta", ({ deltaOperation, isLocal }, target) => {
			if (deltaOperation === MergeTreeDeltaType.INSERT && isLocal) {
				target.removeRange(3, 4);
			}
		});

		assert.throws(() => sharedString.insertText(4, "e"), "Reentrancy detected");

		// If we decided to not throw on reentrancy, this test might instead synchronize and assert the two strings have equal contents.
	});
});
